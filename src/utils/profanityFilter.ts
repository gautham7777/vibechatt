export const sanitizeText = (text: string): string => {
  const badWords = ['badword1', 'badword2', 'spam']; // Add more words as needed
  let sanitized = text;
  badWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    sanitized = sanitized.replace(regex, '***');
  });
  return sanitized;
};
