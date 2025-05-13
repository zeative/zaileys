import { ZodError } from "zod";

export const handleZodError = (error: ZodError) => {
  const formatted = error.errors.map((err) => ({
    field: err.path.join("."),
    message: err.message,
  }));

  return {
    status: "error",
    errors: formatted,
  };
};
