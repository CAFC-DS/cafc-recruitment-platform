/** Whole years since a date of birth, as text; '-' when unknown. */
export const calculateAge = (dateOfBirth?: string | null) => {
  if (!dateOfBirth) return '-';
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return '-';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDifference = today.getMonth() - dob.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? String(age) : '-';
};
