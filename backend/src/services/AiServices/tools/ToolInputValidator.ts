import { JSONSchema, ToolDefinition } from "./ToolRegistry";

const sanitizeUnknownProperties = (
  input: Record<string, unknown>,
  schema: JSONSchema
): Record<string, unknown> => {
  const properties = schema.properties || {};
  const allowedKeys = new Set(Object.keys(properties));
  const sanitized: Record<string, unknown> = {};

  Object.keys(input).forEach(key => {
    if (allowedKeys.has(key)) {
      sanitized[key] = input[key];
    }
  });

  return sanitized;
};

const validateEnum = (
  value: unknown,
  schema: Record<string, unknown>
): boolean => {
  const enumValues = schema.enum as unknown[] | undefined;
  if (!enumValues?.length) return true;
  return enumValues.includes(value);
};

const validatePropertyValue = (
  value: unknown,
  propertySchema: Record<string, unknown>
): string | null => {
  if (propertySchema.type === "string" && typeof value !== "string") {
    return "invalid_param_type";
  }

  if (propertySchema.type === "number" && typeof value !== "number") {
    return "invalid_param_type";
  }

  if (!validateEnum(value, propertySchema)) {
    return "invalid_param_enum";
  }

  return null;
};

export const validateToolInput = (
  tool: ToolDefinition,
  input: Record<string, unknown>
): {
  valid: boolean;
  sanitized: Record<string, unknown>;
  errorCode?: string;
} => {
  const schema = tool.parameters;
  const sanitized = sanitizeUnknownProperties(input, schema);
  const required = schema.required || [];

  const missingRequired = required.find(key => {
    const value = sanitized[key];
    return value === undefined || value === null || value === "";
  });

  if (missingRequired) {
    return { valid: false, sanitized, errorCode: "missing_required_param" };
  }

  const invalidProperty = Object.entries(sanitized).find(([key, value]) => {
    const propertySchema = (schema.properties || {})[key] as
      | Record<string, unknown>
      | undefined;
    if (!propertySchema) {
      return false;
    }

    return validatePropertyValue(value, propertySchema) !== null;
  });

  if (invalidProperty) {
    const [key, value] = invalidProperty;
    const propertySchema = (schema.properties || {})[key] as Record<
      string,
      unknown
    >;
    const errorCode = validatePropertyValue(value, propertySchema);
    return { valid: false, sanitized, errorCode: errorCode || undefined };
  }

  return { valid: true, sanitized };
};
