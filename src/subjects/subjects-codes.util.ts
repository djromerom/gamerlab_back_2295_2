import { SubjectCode } from './subjects-codes.enum';

export function getSubjectCode(subjectName?: string): string {
  if (!subjectName) return genRandomCode();
  return SubjectCode[subjectName as keyof typeof SubjectCode] ?? 'IST';
}

function genRandomCode() {
  let res = '';
  for (let i = 0; i < 3; i++) {
    const char = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    res += char;
  }
  return res;
}
