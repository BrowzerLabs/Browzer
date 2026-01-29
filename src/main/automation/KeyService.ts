import { Debugger } from 'electron';

import { TabService } from '../browser';

import { BaseActionService } from './BaseActionService';

import { ToolExecutionResult } from '@/shared/types';

export interface KeyParams {
  key: string;
  modifiers?: Array<'Control' | 'Shift' | 'Alt' | 'Meta'>;
  tabId: string;
}

export class KeyService extends BaseActionService {
  constructor(tabService: TabService) {
    super(tabService);
  }

  public async execute(params: KeyParams): Promise<ToolExecutionResult> {
    try {
      const cdp = this.getCDP(params.tabId);
      if (!cdp) {
        return {
          success: false,
          error: 'Tab not found, or debugger not avaialable',
        };
      }
      await this.waitForNetworkIdle(cdp, {
        timeout: 3000,
        idleTime: 500,
        maxInflightRequests: 0,
      });

      const modifiers = params.modifiers || [];
      await this.pressKey(cdp, params.key, modifiers);
      return { success: true };
    } catch (error) {
      console.error('[KeyHandler] Error:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown key press error',
      };
    }
  }

  private async pressKey(
    cdp: Debugger,
    key: string,
    modifiers: Array<'Control' | 'Shift' | 'Alt' | 'Meta'>
  ): Promise<void> {
    const modifierBits = this.getModifierBits(modifiers);
    const keyInfo = this.getKeyInfo(key);

    const activeModifiers: Array<'Control' | 'Shift' | 'Alt' | 'Meta'> = [];
    for (const modifier of modifiers) {
      activeModifiers.push(modifier);
      await this.pressModifier(cdp, modifier, true, activeModifiers);
      await this.sleep(10);
    }

    await cdp.sendCommand('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      windowsVirtualKeyCode: keyInfo.keyCode,
      nativeVirtualKeyCode: keyInfo.keyCode,
      key: keyInfo.key,
      code: keyInfo.code,
      text: keyInfo.text,
      unmodifiedText: keyInfo.unmodifiedText,
      modifiers: modifierBits,
    });
    await this.sleep(10);

    // Char event for printable characters
    if (keyInfo.text) {
      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'char',
        text: keyInfo.text,
        unmodifiedText: keyInfo.unmodifiedText,
        modifiers: modifierBits,
      });
      await this.sleep(10);
    }

    // Release the main key
    await cdp.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: keyInfo.keyCode,
      nativeVirtualKeyCode: keyInfo.keyCode,
      key: keyInfo.key,
      code: keyInfo.code,
      modifiers: modifierBits,
    });
    await this.sleep(10);

    // Release modifier keys in reverse order, tracking remaining active modifiers
    const remainingModifiers: Array<'Control' | 'Shift' | 'Alt' | 'Meta'> = [
      ...modifiers,
    ];
    for (let i = modifiers.length - 1; i >= 0; i--) {
      await this.pressModifier(cdp, modifiers[i], false, remainingModifiers);
      remainingModifiers.pop();
      await this.sleep(10);
    }
  }

  private async pressModifier(
    cdp: Debugger,
    modifier: 'Control' | 'Shift' | 'Alt' | 'Meta',
    isDown: boolean,
    activeModifiers: Array<'Control' | 'Shift' | 'Alt' | 'Meta'>
  ): Promise<void> {
    const modifierInfo = this.getModifierInfo(modifier);

    await cdp.sendCommand('Input.dispatchKeyEvent', {
      type: isDown ? 'rawKeyDown' : 'keyUp',
      windowsVirtualKeyCode: modifierInfo.keyCode,
      nativeVirtualKeyCode: modifierInfo.keyCode,
      key: modifierInfo.key,
      code: modifierInfo.code,
      modifiers: this.getModifierBits(activeModifiers),
    });
  }

  private getModifierInfo(modifier: string): {
    key: string;
    code: string;
    keyCode: number;
  } {
    const modifierMap: Record<
      string,
      { key: string; code: string; keyCode: number }
    > = {
      Control: { key: 'Control', code: 'ControlLeft', keyCode: 17 },
      Shift: { key: 'Shift', code: 'ShiftLeft', keyCode: 16 },
      Alt: { key: 'Alt', code: 'AltLeft', keyCode: 18 },
      Meta: { key: 'Meta', code: 'MetaLeft', keyCode: 91 },
    };

    return modifierMap[modifier] || modifierMap.Control;
  }

  private getModifierBits(modifiers: string[]): number {
    let bits = 0;
    if (modifiers.includes('Alt')) bits |= 1;
    if (modifiers.includes('Control')) bits |= 2;
    if (modifiers.includes('Meta')) bits |= 4;
    if (modifiers.includes('Shift')) bits |= 8;
    return bits;
  }

  private getKeyInfo(key: string): {
    key: string;
    code: string;
    keyCode: number;
    text?: string;
    unmodifiedText?: string;
  } {
    // Special keys mapping
    const specialKeys: Record<
      string,
      { key: string; code: string; keyCode: number }
    > = {
      // Navigation
      Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
      Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
      Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
      Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
      Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
      Space: { key: ' ', code: 'Space', keyCode: 32 },

      // Arrows
      ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
      ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
      ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
      ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },

      // Navigation keys
      Home: { key: 'Home', code: 'Home', keyCode: 36 },
      End: { key: 'End', code: 'End', keyCode: 35 },
      PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
      PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },

      // Function keys
      F1: { key: 'F1', code: 'F1', keyCode: 112 },
      F2: { key: 'F2', code: 'F2', keyCode: 113 },
      F3: { key: 'F3', code: 'F3', keyCode: 114 },
      F4: { key: 'F4', code: 'F4', keyCode: 115 },
      F5: { key: 'F5', code: 'F5', keyCode: 116 },
      F6: { key: 'F6', code: 'F6', keyCode: 117 },
      F7: { key: 'F7', code: 'F7', keyCode: 118 },
      F8: { key: 'F8', code: 'F8', keyCode: 119 },
      F9: { key: 'F9', code: 'F9', keyCode: 120 },
      F10: { key: 'F10', code: 'F10', keyCode: 121 },
      F11: { key: 'F11', code: 'F11', keyCode: 122 },
      F12: { key: 'F12', code: 'F12', keyCode: 123 },
    };

    // Check if it's a special key
    if (specialKeys[key]) {
      const info = specialKeys[key];
      return {
        key: info.key,
        code: info.code,
        keyCode: info.keyCode,
        text: info.key === ' ' ? ' ' : undefined,
        unmodifiedText: info.key === ' ' ? ' ' : undefined,
      };
    }

    // Handle single character keys (letters, numbers, symbols)
    if (key.length === 1) {
      const char = key;
      const upperChar = char.toUpperCase();
      const lowerChar = char.toLowerCase();

      // Letters (a-z, A-Z)
      if (/[a-zA-Z]/.test(char)) {
        const keyCode = upperChar.charCodeAt(0);
        return {
          key: lowerChar,
          code: `Key${upperChar}`,
          keyCode: keyCode,
          text: char,
          unmodifiedText: lowerChar,
        };
      }

      // Numbers (0-9)
      if (/[0-9]/.test(char)) {
        const keyCode = char.charCodeAt(0);
        return {
          key: char,
          code: `Digit${char}`,
          keyCode: keyCode,
          text: char,
          unmodifiedText: char,
        };
      }

      // Special characters and symbols
      const symbolMap: Record<string, { code: string; keyCode: number }> = {
        '/': { code: 'Slash', keyCode: 191 },
        '\\': { code: 'Backslash', keyCode: 220 },
        '?': { code: 'Slash', keyCode: 191 },
        '.': { code: 'Period', keyCode: 190 },
        ',': { code: 'Comma', keyCode: 188 },
        ';': { code: 'Semicolon', keyCode: 186 },
        ':': { code: 'Semicolon', keyCode: 186 },
        "'": { code: 'Quote', keyCode: 222 },
        '"': { code: 'Quote', keyCode: 222 },
        '[': { code: 'BracketLeft', keyCode: 219 },
        ']': { code: 'BracketRight', keyCode: 221 },
        '{': { code: 'BracketLeft', keyCode: 219 },
        '}': { code: 'BracketRight', keyCode: 221 },
        '-': { code: 'Minus', keyCode: 189 },
        _: { code: 'Minus', keyCode: 189 },
        '=': { code: 'Equal', keyCode: 187 },
        '+': { code: 'Equal', keyCode: 187 },
        '`': { code: 'Backquote', keyCode: 192 },
        '~': { code: 'Backquote', keyCode: 192 },
        '!': { code: 'Digit1', keyCode: 49 },
        '@': { code: 'Digit2', keyCode: 50 },
        '#': { code: 'Digit3', keyCode: 51 },
        $: { code: 'Digit4', keyCode: 52 },
        '%': { code: 'Digit5', keyCode: 53 },
        '^': { code: 'Digit6', keyCode: 54 },
        '&': { code: 'Digit7', keyCode: 55 },
        '*': { code: 'Digit8', keyCode: 56 },
        '(': { code: 'Digit9', keyCode: 57 },
        ')': { code: 'Digit0', keyCode: 48 },
        '<': { code: 'Comma', keyCode: 188 },
        '>': { code: 'Period', keyCode: 190 },
        '|': { code: 'Backslash', keyCode: 220 },
      };

      if (symbolMap[char]) {
        return {
          key: char,
          code: symbolMap[char].code,
          keyCode: symbolMap[char].keyCode,
          text: char,
          unmodifiedText: char,
        };
      }
    }

    // Fallback for unknown keys - treat as character
    console.warn(`[KeyHandler] Unknown key: ${key}, treating as character`);
    return {
      key: key,
      code: `Key${key.toUpperCase()}`,
      keyCode: key.charCodeAt(0),
      text: key,
      unmodifiedText: key,
    };
  }
}
