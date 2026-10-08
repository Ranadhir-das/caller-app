export const COURSES = [
  ['MBBS', 'MBBS'], ['BDS', 'BDS'], ['BTECH', 'BTECH'], ['GNM_NURSING', 'GNM NURSING'],
  ['BSC_NURSING', 'BSC NURSING'], ['PHARMACY', 'PHARMACY'], ['MBA', 'MBA'], ['MD_MS', 'MD/MS'], ['OTHERS', 'Others'],
] as const;
export const courseLabel = (code?: string | null, custom?: string) => code === 'OTHERS' ? custom || 'Others' : COURSES.find(([key]) => key === code)?.[1] || 'Not recorded';
export const allowsContact = (outcome: string) => !!outcome && !['not_interested', 'no_candidate', 'wrong_number', 'admission_done_by_other_consultancy'].includes(outcome.toLowerCase());
export const validYear = (year: string) => /^\d{1,4}$/.test(year) && Number(year) >= 1 && Number(year) <= 9999;
export function renderWhatsAppTemplate(message: string, values: Record<string, string>) {
  return message.replace(/\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/g, (match, double, single) => values[double || single] ?? match);
}

export const validCourse = (course: string, custom = '') =>
  COURSES.some(([code]) => code === course) &&
  (course !== 'OTHERS' || (!!custom.trim() && custom.trim().length <= 150));
export const completeInterestedSelection = (course: string, custom: string, year: string) =>
  validCourse(course, custom) && validYear(year);
