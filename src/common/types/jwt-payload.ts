/** JWT access-token payload shape */
export interface JwtPayload {
  sub: number; // user id
  email: string;
  role: string;
}
