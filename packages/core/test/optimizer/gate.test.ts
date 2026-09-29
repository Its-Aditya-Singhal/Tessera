import { describe, expect, it } from 'vitest';
import { foldAnswers, gatePrompt, scriptOf } from '../../src/optimizer/gate';

describe('gatePrompt', () => {
  it('leaves a well-specified prompt alone', () => {
    const r = gatePrompt(
      'Write a 5-bullet summary of the meeting notes below for my manager. Keep each bullet under 15 words and avoid jargon.\n\nNotes: we moved the launch to March because QA found two blocking bugs.',
    );
    expect(r.verdict).toBe('ok_as_is');
    expect(r.hints).toEqual([]);
  });

  it('asks when "it" has nothing to point at', () => {
    const r = gatePrompt('fix it');
    expect(r.verdict).toBe('ask');
    expect(r.questions.length).toBeGreaterThan(0);
    expect(r.questions.length).toBeLessThanOrEqual(2);
  });

  it('suggests improvements for a short, vague ask', () => {
    const r = gatePrompt('write something about climate change');
    expect(r.verdict).toBe('improve');
    expect(r.hints.length).toBeGreaterThan(0);
  });

  it('does not treat code as missing context', () => {
    const r = gatePrompt('why does this crash?\n\n```py\nprint(1/0)\n```');
    expect(r.signals.hasCode).toBe(true);
    expect(r.signals.hasContext).toBe(true);
    expect(r.verdict).not.toBe('ask');
  });

  it('recognises Hindi, Tamil and Hinglish asks', () => {
    expect(gatePrompt('मुझे पायथन में सूची को उल्टा करना समझाओ').signals.hasTask).toBe(true);
    expect(
      gatePrompt('பைத்தானில் பட்டியலை எப்படி திருப்புவது என்று விளக்குங்கள்').signals.hasTask,
    ).toBe(true);
    expect(gatePrompt('python me list reverse kaise karte hai batao').signals.hasTask).toBe(true);
    expect(scriptOf('மொழிபெயர்')).toBe('tamil');
    expect(scriptOf('नमस्ते दुनिया')).toBe('devanagari');
  });

  it('treats an empty prompt as nothing to do', () => {
    expect(gatePrompt('   ').verdict).toBe('ok_as_is');
  });

  it('folds answers into the prompt without touching the original words', () => {
    expect(
      foldAnswers('fix it', [
        { question: 'What?', answer: 'the login bug in auth.ts' },
        { question: 'Format?', answer: ' ' },
      ]),
    ).toBe('fix it\n\nthe login bug in auth.ts');
  });
});
