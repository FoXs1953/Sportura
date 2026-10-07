/** Called only after the account password has been verified. */
export async function requireEmailConfirmation(
  resend: () => Promise<unknown>,
): Promise<never> {
  try {
    await resend();
  } catch {
    // Keep mail diagnostics private, while still explaining why sign-in failed.
    throw new Error(
      "Подтвердите e-mail, чтобы войти. Не удалось отправить новую ссылку. Попробуйте позже или обратитесь в поддержку.",
    );
  }
  // SMTP acceptance does not guarantee inbox delivery.
  throw new Error(
    "Подтвердите e-mail, чтобы войти. Запрос новой ссылки принят. Проверьте входящие и папку «Спам».",
  );
}
