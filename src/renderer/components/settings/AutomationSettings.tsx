// import { useState } from 'react';
// import { Button } from '@/renderer/ui/button';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/renderer/ui/select';
// import { RotateCcw, Eye, EyeOff, Key, AlertCircle } from 'lucide-react';
// import { Link } from '@/renderer/ui/link';
// import { Alert, AlertDescription } from '@/renderer/ui/alert';
// import { AppSettings } from '@/shared/types';
// import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/renderer/ui/field';
// import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from '@/renderer/ui/input-group';

// interface AutomationSettingsProps {
//   settings: AppSettings['automation'];
//   onUpdate: (key: string, value: string | boolean) => void;
//   onReset: () => void;
// }

// export function AutomationSettings({ settings, onUpdate, onReset }: AutomationSettingsProps) {
//   const [showGeminiKey, setShowGeminiKey] = useState(false);
//   const [showClaudeKey, setShowClaudeKey] = useState(false);
//   const [showOpenAIKey, setShowOpenAIKey] = useState(false);

//   return (
//     <div className='space-y-6'>
//       {/* Header */}
//       <div className='flex items-center justify-between'>
//         <div>
//           <h2 className='text-xl font-semibold'>Automation</h2>
//           <p className='text-muted-foreground mt-1 text-sm'>
//             Configure AI-powered browser automation
//           </p>
//         </div>
//         <Button variant='outline' size='sm' onClick={onReset}>
//           <RotateCcw className='mr-2 h-4 w-4' />
//           Reset to defaults
//         </Button>
//       </div>

//       <FieldGroup>
//         {/* LLM Provider */}
//         <Field>
//           <FieldLabel>Default AI Provider</FieldLabel>
//           <Select 
//             value={settings.defaultProvider} 
//             onValueChange={(value) => onUpdate('defaultProvider', value)}
//           >
//             <SelectTrigger>
//               <SelectValue placeholder='Select AI provider' />
//             </SelectTrigger>
//             <SelectContent>
//               <SelectItem value='gemini'>Google Gemini</SelectItem>
//               <SelectItem value='claude'>Anthropic Claude</SelectItem>
//               <SelectItem value='openai'>OpenAI GPT</SelectItem>
//             </SelectContent>
//           </Select>
//           <FieldDescription>
//             Choose which AI model to use for browser automation tasks
//           </FieldDescription>
//         </Field>

//         {/* Gemini API Key */}
//         <Field>
//           <FieldLabel htmlFor='geminiApiKey'>
//             <Key className='h-4 w-4' />
//             Google Gemini API Key
//           </FieldLabel>
//           <InputGroup>
//             <InputGroupInput
//               id='geminiApiKey'
//               type={showGeminiKey ? 'text' : 'password'}
//               value={settings.geminiApiKey}
//               onChange={(e) => onUpdate('geminiApiKey', e.target.value)}
//               placeholder='sk-...'
//             />
//             <InputGroupAddon align='inline-end'>
//               <InputGroupButton
//                 size='icon-sm'
//                 onClick={() => setShowGeminiKey(!showGeminiKey)}
//                 aria-label={showGeminiKey ? 'Hide API key' : 'Show API key'}
//               >
//                 {showGeminiKey ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
//               </InputGroupButton>
//             </InputGroupAddon>
//           </InputGroup>
//           <FieldDescription>
//             Get your API key from{' '}
//             <Link href='https://makersuite.google.com/app/apikey' target='tab'>
//               Google AI Studio
//             </Link>
//           </FieldDescription>
//         </Field>

//         {/* Claude API Key */}
//         <Field>
//           <FieldLabel htmlFor='claudeApiKey'>
//             <Key className='h-4 w-4' />
//             Anthropic Claude API Key
//           </FieldLabel>
//           <InputGroup>
//             <InputGroupInput
//               id='claudeApiKey'
//               type={showClaudeKey ? 'text' : 'password'}
//               value={settings.claudeApiKey}
//               onChange={(e) => onUpdate('claudeApiKey', e.target.value)}
//               placeholder='sk-ant-...'
//             />
//             <InputGroupAddon align='inline-end'>
//               <InputGroupButton
//                 size='icon-sm'
//                 onClick={() => setShowClaudeKey(!showClaudeKey)}
//                 aria-label={showClaudeKey ? 'Hide API key' : 'Show API key'}
//               >
//                 {showClaudeKey ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
//               </InputGroupButton>
//             </InputGroupAddon>
//           </InputGroup>
//           <FieldDescription>
//             Get your API key from{' '}
//             <Link href='https://console.anthropic.com/settings/keys' target='tab'>
//               Anthropic Console
//             </Link>
//           </FieldDescription>
//         </Field>

//         {/* OpenAI API Key */}
//         <Field>
//           <FieldLabel htmlFor='openaiApiKey'>
//             <Key className='h-4 w-4' />
//             OpenAI API Key
//           </FieldLabel>
//           <InputGroup>
//             <InputGroupInput
//               id='openaiApiKey'
//               type={showOpenAIKey ? 'text' : 'password'}
//               value={settings.openaiApiKey}
//               onChange={(e) => onUpdate('openaiApiKey', e.target.value)}
//               placeholder='sk-proj-...'
//             />
//             <InputGroupAddon align='inline-end'>
//               <InputGroupButton
//                 size='icon-sm'
//                 onClick={() => setShowOpenAIKey(!showOpenAIKey)}
//                 aria-label={showOpenAIKey ? 'Hide API key' : 'Show API key'}
//               >
//                 {showOpenAIKey ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
//               </InputGroupButton>
//             </InputGroupAddon>
//           </InputGroup>
//           <FieldDescription>
//             Get your API key from{' '}
//             <Link href='https://platform.openai.com/api-keys' target='tab'>
//               OpenAI Platform
//             </Link>
//           </FieldDescription>
//         </Field>

//         {/* Security Notice */}
//         <Alert>
//           <AlertCircle className='h-4 w-4' />
//           <AlertDescription>
//             Your API keys are stored securely on your local machine and are never sent to any 
//             third-party servers except the respective AI providers.
//           </AlertDescription>
//         </Alert>
//       </FieldGroup>
//     </div>
//   );
// }