/** Anthropic OAuth refresh 토큰이 만료·회수된 오류인지 판별한다. OAuth 재로그인으로 회복 가능하므로 provider 실패로 표시하지 않는다. */
export function isInvalidOAuthRefresh(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /invalid_grant|refresh token (?:not found|invalid|expired|revoked)/iu.test(message);
}
