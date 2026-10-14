/**
 * Tests for WhatsApp Phone Verification
 * 
 * Run with: npm test verification.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateCodeDigits,
  formatVerificationCode,
  parseVerificationCode,
  hashVerificationCode,
  verifyCodeHash,
  VERIFICATION_CONSTANTS,
} from '../verification';

describe('WhatsApp Verification Code Generation', () => {
  it('generates 6-digit numeric codes', () => {
    const code = generateCodeDigits();
    expect(code).toMatch(/^\d{6}$/);
    expect(code.length).toBe(6);
  });

  it('generates different codes on successive calls', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(generateCodeDigits());
    }
    // Should have high entropy (at least 95 unique codes out of 100)
    expect(codes.size).toBeGreaterThan(95);
  });

  it('formats codes correctly', () => {
    const formatted = formatVerificationCode('123456');
    expect(formatted).toBe('CLOSET-123456');
  });

  it('throws error for invalid code length', () => {
    expect(() => formatVerificationCode('12345')).toThrow();
    expect(() => formatVerificationCode('1234567')).toThrow();
  });
});

describe('WhatsApp Verification Code Parsing', () => {
  it('parses correctly formatted codes', () => {
    expect(parseVerificationCode('CLOSET-123456')).toBe('123456');
    expect(parseVerificationCode('closet-123456')).toBe('123456');
    expect(parseVerificationCode('CLOSET 123456')).toBe('123456');
  });

  it('handles digits-only input', () => {
    expect(parseVerificationCode('123456')).toBe('123456');
  });

  it('handles whitespace', () => {
    expect(parseVerificationCode('  CLOSET-123456  ')).toBe('123456');
    expect(parseVerificationCode('CLOSET - 123456')).toBe('123456');
  });

  it('rejects invalid formats', () => {
    expect(parseVerificationCode('12345')).toBeNull(); // Too short
    expect(parseVerificationCode('1234567')).toBeNull(); // Too long
    expect(parseVerificationCode('CLOSET-ABCDEF')).toBeNull(); // Not digits
    expect(parseVerificationCode('')).toBeNull(); // Empty
    expect(parseVerificationCode('CLOSET-')).toBeNull(); // No digits
  });
});

describe('WhatsApp Verification Code Hashing', () => {
  beforeAll(() => {
    // Set test pepper
    process.env.WHATSAPP_VERIFICATION_PEPPER = 'test-pepper-for-unit-tests-minimum-32-chars-long';
  });

  it('produces consistent hashes for same code', () => {
    const hash1 = hashVerificationCode('123456');
    const hash2 = hashVerificationCode('123456');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different codes', () => {
    const hash1 = hashVerificationCode('123456');
    const hash2 = hashVerificationCode('654321');
    expect(hash1).not.toBe(hash2);
  });

  it('produces SHA-256 hex string (64 chars)', () => {
    const hash = hashVerificationCode('123456');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws error if pepper not set', () => {
    delete process.env.WHATSAPP_VERIFICATION_PEPPER;
    expect(() => hashVerificationCode('123456')).toThrow('WHATSAPP_VERIFICATION_PEPPER');
    // Restore for other tests
    process.env.WHATSAPP_VERIFICATION_PEPPER = 'test-pepper-for-unit-tests-minimum-32-chars-long';
  });

  it('throws error if pepper too short', () => {
    process.env.WHATSAPP_VERIFICATION_PEPPER = 'short';
    expect(() => hashVerificationCode('123456')).toThrow('at least 32 characters');
    // Restore for other tests
    process.env.WHATSAPP_VERIFICATION_PEPPER = 'test-pepper-for-unit-tests-minimum-32-chars-long';
  });
});

describe('WhatsApp Verification Code Hash Verification', () => {
  beforeAll(() => {
    process.env.WHATSAPP_VERIFICATION_PEPPER = 'test-pepper-for-unit-tests-minimum-32-chars-long';
  });

  it('verifies correct codes', () => {
    const code = '123456';
    const hash = hashVerificationCode(code);
    expect(verifyCodeHash(code, hash)).toBe(true);
  });

  it('rejects incorrect codes', () => {
    const hash = hashVerificationCode('123456');
    expect(verifyCodeHash('654321', hash)).toBe(false);
  });

  it('uses constant-time comparison', () => {
    const hash = hashVerificationCode('123456');
    
    // Time should be similar regardless of how close the guess is
    const start1 = process.hrtime.bigint();
    verifyCodeHash('000000', hash);
    const end1 = process.hrtime.bigint();
    
    const start2 = process.hrtime.bigint();
    verifyCodeHash('123455', hash); // One digit off
    const end2 = process.hrtime.bigint();
    
    const time1 = Number(end1 - start1);
    const time2 = Number(end2 - start2);
    
    // Times should be within same order of magnitude (prevent timing attacks)
    // This is a loose check since Node.js timing can vary
    const ratio = Math.max(time1, time2) / Math.min(time1, time2);
    expect(ratio).toBeLessThan(10);
  });
});

describe('Verification Constants', () => {
  it('exports expected constants', () => {
    expect(VERIFICATION_CONSTANTS.CODE_PREFIX).toBe('CLOSET');
    expect(VERIFICATION_CONSTANTS.CODE_LENGTH).toBe(6);
    expect(VERIFICATION_CONSTANTS.CODE_EXPIRY_MINUTES).toBe(15);
    expect(VERIFICATION_CONSTANTS.MAX_ACTIVE_CODES).toBe(1); // only the newest code is ever valid
    expect(VERIFICATION_CONSTANTS.RATE_LIMIT_ATTEMPTS).toBe(5);
    expect(VERIFICATION_CONSTANTS.RATE_LIMIT_WINDOW_HOURS).toBe(1);
  });
});

describe('Security Properties', () => {
  beforeAll(() => {
    process.env.WHATSAPP_VERIFICATION_PEPPER = 'test-pepper-for-unit-tests-minimum-32-chars-long';
  });

  it('pepper changes hash output', () => {
    const hash1 = hashVerificationCode('123456');
    
    process.env.WHATSAPP_VERIFICATION_PEPPER = 'different-pepper-for-unit-tests-min-32-chars';
    const hash2 = hashVerificationCode('123456');
    
    expect(hash1).not.toBe(hash2);
    
    // Restore
    process.env.WHATSAPP_VERIFICATION_PEPPER = 'test-pepper-for-unit-tests-minimum-32-chars-long';
  });

  it('cannot reverse hash to get original code', () => {
    const code = '123456';
    const hash = hashVerificationCode(code);
    
    // Hash should not contain the original code
    expect(hash).not.toContain('123456');
    expect(hash).not.toContain('CLOSET');
  });

  it('collision resistance: different codes produce different hashes', () => {
    const hashes = new Set();
    for (let i = 0; i < 1000; i++) {
      const code = String(i).padStart(6, '0');
      hashes.add(hashVerificationCode(code));
    }
    expect(hashes.size).toBe(1000); // No collisions
  });
});

describe("parseVerificationCode strictness", () => {
  it.each(["CLOSET-123456", "closet-123456", "closet 123456", "123456", "  123456  "])("accepts %j", (input) => {
    expect(parseVerificationCode(input)).toBe("123456");
  });

  it.each(["my order 123456 please", "1234567", "12345", "call 08012345678", "CLOSET-12 34 56", "code is 123456", ""])(
    "rejects %j",
    (input) => {
      expect(parseVerificationCode(input)).toBeNull();
    },
  );
});
