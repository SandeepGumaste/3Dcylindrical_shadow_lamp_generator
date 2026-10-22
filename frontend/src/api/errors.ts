export class ApiError extends Error {
  name = 'ApiError';
  constructor(public status: number, message: string, public errors?: string[]) {
    super(message);
  }
}
