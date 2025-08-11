import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'mailgun' | 'resend';
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  apiKey?: string;
  from: string;
  fromName: string;
}

export interface OTPRecord {
  email: string;
  otp: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

export class EmailService {
  private config: EmailConfig | null = null;
  private transporter: nodemailer.Transporter | null = null;
  private otpStorage: Map<string, OTPRecord> = new Map();
  private readonly OTP_EXPIRY_TIME = 10 * 60 * 1000; // 10 minutes
  private readonly MAX_ATTEMPTS = 3;
  private readonly RATE_LIMIT_TIME = 60 * 1000; // 1 minute between sends

  constructor() {
    this.loadConfig();
    this.setupCleanupInterval();
  }

  private loadConfig(): void {
    try {
      const configPath = path.join(app.getPath('userData'), 'email-config.json');
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        this.config = JSON.parse(configData);
        this.initializeTransporter();
      }
    } catch (error) {
      console.error('Failed to load email configuration:', error);
    }
  }

  public async saveConfig(config: EmailConfig): Promise<void> {
    try {
      const configPath = path.join(app.getPath('userData'), 'email-config.json');
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
      this.config = config;
      this.initializeTransporter();
    } catch (error) {
      console.error('Failed to save email configuration:', error);
      throw new Error('Failed to save email configuration');
    }
  }

  private initializeTransporter(): void {
    if (!this.config) return;

    try {
      switch (this.config.provider) {
        case 'smtp':
          if (this.config.smtp) {
            this.transporter = nodemailer.createTransport({
              host: this.config.smtp.host,
              port: this.config.smtp.port,
              secure: this.config.smtp.secure,
              auth: this.config.smtp.auth,
            });
          }
          break;

        case 'sendgrid':
          if (this.config.apiKey) {
            this.transporter = nodemailer.createTransport({
              service: 'SendGrid',
              auth: {
                user: 'apikey',
                pass: this.config.apiKey,
              },
            });
          }
          break;

        case 'mailgun':
          if (this.config.apiKey) {
            // Mailgun configuration would go here
            console.warn('Mailgun integration not yet implemented');
          }
          break;

        case 'resend':
          if (this.config.apiKey) {
            // Resend configuration would go here
            console.warn('Resend integration not yet implemented');
          }
          break;
      }
    } catch (error) {
      console.error('Failed to initialize email transporter:', error);
    }
  }

  public async sendOTP(email: string): Promise<{ success: boolean; message: string }> {
    try {
      // Validate email format
      if (!this.isValidEmail(email)) {
        return { success: false, message: 'Invalid email address' };
      }

      // Check rate limiting
      const existingRecord = this.otpStorage.get(email);
      if (existingRecord && (Date.now() - existingRecord.createdAt) < this.RATE_LIMIT_TIME) {
        const remainingTime = Math.ceil((this.RATE_LIMIT_TIME - (Date.now() - existingRecord.createdAt)) / 1000);
        return { 
          success: false, 
          message: `Please wait ${remainingTime} seconds before requesting another code` 
        };
      }

      // Generate OTP
      const otp = this.generateOTP();
      
      // Store OTP record
      const otpRecord: OTPRecord = {
        email,
        otp,
        expiresAt: Date.now() + this.OTP_EXPIRY_TIME,
        attempts: 0,
        createdAt: Date.now(),
      };
      
      this.otpStorage.set(email, otpRecord);

      // Send email
      if (this.config && this.transporter) {
        await this.sendEmail(email, otp);
        return { success: true, message: 'Verification code sent successfully' };
      } else {
        // Fallback: Log OTP for development
        // console.log(`🔐 OTP for ${email}: ${otp} (expires in 10 minutes)`);
        return { success: true, message: 'Verification code sent (check console in development)' };
      }

    } catch (error) {
      console.error('Failed to send OTP:', error);
      return { success: false, message: 'Failed to send verification code' };
    }
  }

  public async verifyOTP(email: string, inputOtp: string): Promise<{ success: boolean; message: string }> {
    try {
      const record = this.otpStorage.get(email);
      
      if (!record) {
        return { success: false, message: 'No verification code found. Please request a new one.' };
      }

      // Check expiry
      if (Date.now() > record.expiresAt) {
        this.otpStorage.delete(email);
        return { success: false, message: 'Verification code has expired. Please request a new one.' };
      }

      // Check attempts
      if (record.attempts >= this.MAX_ATTEMPTS) {
        this.otpStorage.delete(email);
        return { success: false, message: 'Too many failed attempts. Please request a new code.' };
      }

      // Verify OTP
      if (record.otp === inputOtp) {
        this.otpStorage.delete(email);
        await this.saveVerifiedUser(email);
        return { success: true, message: 'Email verified successfully!' };
      } else {
        record.attempts++;
        const remainingAttempts = this.MAX_ATTEMPTS - record.attempts;
        if (remainingAttempts > 0) {
          return { 
            success: false, 
            message: `Invalid code. ${remainingAttempts} attempts remaining.` 
          };
        } else {
          this.otpStorage.delete(email);
          return { success: false, message: 'Too many failed attempts. Please request a new code.' };
        }
      }

    } catch (error) {
      console.error('Failed to verify OTP:', error);
      return { success: false, message: 'Verification failed' };
    }
  }

  private async sendEmail(email: string, otp: string): Promise<void> {
    if (!this.transporter || !this.config) {
      throw new Error('Email transporter not configured');
    }

    const mailOptions = {
      from: `${this.config.fromName} <${this.config.from}>`,
      to: email,
      subject: 'Welcome to Browzer - Verify Your Email',
      html: this.generateEmailTemplate(otp),
      text: `Welcome to Browzer!\n\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
    };

    await this.transporter.sendMail(mailOptions);
  }

  private generateEmailTemplate(otp: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Browzer Email Verification</title>
      </head>
      <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; padding: 20px; background: rgba(255, 255, 255, 0.05); border-radius: 20px; margin-bottom: 20px;">
              <span style="font-size: 48px;">🌐</span>
            </div>
            <h1 style="color: #ffffff; font-size: 28px; margin: 0; font-weight: 600;">Welcome to Browzer</h1>
            <p style="color: rgba(255, 255, 255, 0.7); font-size: 16px; margin: 8px 0 0 0;">The AI-powered browser that thinks ahead</p>
          </div>

          <!-- Main Content -->
          <div style="background: rgba(255, 255, 255, 0.05); border-radius: 20px; padding: 40px; text-align: center; border: 1px solid rgba(255, 255, 255, 0.1);">
            <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0; font-weight: 500;">Verify Your Email Address</h2>
            <p style="color: rgba(255, 255, 255, 0.8); font-size: 16px; line-height: 1.5; margin: 0 0 30px 0;">
              To complete your Browzer setup, please enter this verification code in the app:
            </p>
            
            <!-- OTP Code -->
            <div style="background: linear-gradient(135deg, #00f5ff, #ff0080); padding: 20px; border-radius: 12px; margin: 30px 0; display: inline-block;">
              <div style="background: rgba(0, 0, 0, 0.2); padding: 15px 30px; border-radius: 8px;">
                <span style="color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</span>
              </div>
            </div>
            
            <p style="color: rgba(255, 255, 255, 0.6); font-size: 14px; margin: 20px 0 0 0;">
              This code will expire in <strong style="color: #00f5ff;">10 minutes</strong>
            </p>
          </div>

          <!-- Footer -->
          <div style="text-align: center; margin-top: 40px;">
            <p style="color: rgba(255, 255, 255, 0.5); font-size: 14px; line-height: 1.5;">
              If you didn't request this verification code, please ignore this email.<br>
              Need help? Contact us at support@browzer.ai
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private async saveVerifiedUser(email: string): Promise<void> {
    try {
      const usersPath = path.join(app.getPath('userData'), 'verified-users.json');
      let users: { email: string; verifiedAt: number }[] = [];
      
      if (fs.existsSync(usersPath)) {
        const usersData = await fs.promises.readFile(usersPath, 'utf8');
        users = JSON.parse(usersData);
      }
      
      // Add or update user
      const existingIndex = users.findIndex(user => user.email === email);
      const userRecord = { email, verifiedAt: Date.now() };
      
      if (existingIndex >= 0) {
        users[existingIndex] = userRecord;
      } else {
        users.push(userRecord);
      }
      
      await fs.promises.writeFile(usersPath, JSON.stringify(users, null, 2));
    } catch (error) {
      console.error('Failed to save verified user:', error);
    }
  }

  private setupCleanupInterval(): void {
    // Clean up expired OTPs every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [email, record] of this.otpStorage.entries()) {
        if (now > record.expiresAt) {
          this.otpStorage.delete(email);
        }
      }
    }, 5 * 60 * 1000);
  }

  public async getVerifiedUsers(): Promise<{ email: string; verifiedAt: number }[]> {
    try {
      const usersPath = path.join(app.getPath('userData'), 'verified-users.json');
      if (fs.existsSync(usersPath)) {
        const usersData = await fs.promises.readFile(usersPath, 'utf8');
        return JSON.parse(usersData);
      }
      return [];
    } catch (error) {
      console.error('Failed to get verified users:', error);
      return [];
    }
  }

  public async isUserVerified(email: string): Promise<boolean> {
    const users = await this.getVerifiedUsers();
    return users.some(user => user.email === email);
  }

  public async testConfiguration(): Promise<{ success: boolean; message: string }> {
    if (!this.config || !this.transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      await this.transporter.verify();
      return { success: true, message: 'Email configuration is valid' };
    } catch (error) {
      return { success: false, message: `Configuration test failed: ${error}` };
    }
  }
}
