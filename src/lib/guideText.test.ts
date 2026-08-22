import { describe, it, expect } from 'vitest';
import { sanitizeGuideText, stripLeadingGreeting } from './guideText';

describe('sanitizeGuideText and stripLeadingGreeting', () => {
  it('strips leading Japanese greetings with punctuation', () => {
    expect(sanitizeGuideText('こんにちは。今、私たちの目の前にあるのはモナ・リザです。')).toBe(
      '今、私たちの目の前にあるのはモナ・リザです。'
    );
    expect(sanitizeGuideText('ようこそ。この作品は星月夜です。')).toBe(
      'この作品は星月夜です。'
    );
    expect(sanitizeGuideText('皆様、こちらの絵画をご覧ください。')).toBe(
      'こちらの絵画をご覧ください。'
    );
    expect(sanitizeGuideText('初めまして！本日はフェルメールの真珠の耳飾りの少女をご案内します。')).toBe(
      '本日はフェルメールの真珠の耳飾りの少女をご案内します。'
    );
    expect(sanitizeGuideText('はじめまして。この作品について解説します。')).toBe(
      'この作品について解説します。'
    );
    expect(sanitizeGuideText('こんばんは、今宵ご紹介するのは夜警です。')).toBe(
      '今宵ご紹介するのは夜警です。'
    );
  });

  it('leaves standard guides without greetings untouched', () => {
    const text = '1889年に描かれた本作は、フィンセント・ファン・ゴッホの代表作の一つです。青と黄色の渦巻く夜空が印象的です。';
    expect(sanitizeGuideText(text)).toBe(text);
  });

  it('strips English greetings', () => {
    expect(sanitizeGuideText('Hello, this guide explores Starry Night.', 'en')).toBe(
      'this guide explores Starry Night.'
    );
    expect(sanitizeGuideText('Welcome! Standing before us is the Mona Lisa.', 'en')).toBe(
      'Standing before us is the Mona Lisa.'
    );
    expect(sanitizeGuideText('Greetings, today we explore The Scream.', 'en')).toBe(
      'today we explore The Scream.'
    );
  });

  it('strips French greetings', () => {
    expect(sanitizeGuideText('Bonjour, nous regardons aujourd’hui La Joconde.', 'fr')).toBe(
      'nous regardons aujourd’hui La Joconde.'
    );
    expect(sanitizeGuideText('Bienvenue devant ce chef-d’œuvre impressionniste.', 'fr')).toBe(
      'devant ce chef-d’œuvre impressionniste.'
    );
  });

  it('strips Chinese greetings', () => {
    expect(sanitizeGuideText('你好！这幅作品是达芬奇的蒙娜丽莎。', 'zh')).toBe(
      '这幅作品是达芬奇的蒙娜丽莎。'
    );
    expect(sanitizeGuideText('欢迎，今天我们要欣赏的是星夜。', 'zh')).toBe(
      '今天我们要欣赏的是星夜。'
    );
  });

  it('strips Spanish greetings', () => {
    expect(sanitizeGuideText('Hola, hoy contemplamos Las Meninas de Velázquez.', 'es')).toBe(
      'hoy contemplamos Las Meninas de Velázquez.'
    );
    expect(sanitizeGuideText('Bienvenido a esta guía sobre Guernica.', 'es')).toBe(
      'a esta guía sobre Guernica.'
    );
  });

  it('preserves section headers while cleaning escapes and greetings', () => {
    const raw = '\\n\\nこんにちは。## 作品概要\\n\\n本作はレオナルド・ダ・ヴィンチによる傑作です。';
    expect(sanitizeGuideText(raw)).toBe(
      '## 作品概要\n\n本作はレオナルド・ダ・ヴィンチによる傑作です。'
    );
  });

  it('stripLeadingGreeting helper function works across languages', () => {
    expect(stripLeadingGreeting('こんにちは、世界')).toBe('世界');
    expect(stripLeadingGreeting('Hello, world', 'en')).toBe('world');
    expect(stripLeadingGreeting('Bonjour monde', 'fr')).toBe('monde');
    expect(stripLeadingGreeting('Hallo Welt', 'de')).toBe('Welt');
    expect(stripLeadingGreeting('Ciao mondo', 'it')).toBe('mondo');
  });
});
