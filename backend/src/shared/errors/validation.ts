import { ValidationError, ValidationPipe } from '@nestjs/common';
import { Errors } from './app-error';

function flatten(errors: ValidationError[], prefix = ''): { field: string; issues: string[] }[] {
  return errors.flatMap((e) => {
    const field = prefix ? `${prefix}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, issues: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/** Global DTO validation producing `400 VALIDATION_ERROR` with `details.fields`. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: true,
    exceptionFactory: (errors) => Errors.validation(flatten(errors)),
  });
}
