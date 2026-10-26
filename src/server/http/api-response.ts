export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiSuccessBody<T> = {
  data: T;
};

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return Response.json({ data } satisfies ApiSuccessBody<T>, init);
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return Response.json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    } satisfies ApiErrorBody,
    { status },
  );
}
