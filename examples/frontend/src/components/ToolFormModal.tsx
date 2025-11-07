import { useState, FormEvent } from "react";
import { Tool } from "../types/chat";
import { formatPrice } from "../utils/priceFormatter";

interface ToolFormModalProps {
  tool: Tool | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (toolName: string, input: Record<string, unknown>) => void;
}

// Helper function to generate form fields from JSON Schema
const generateFormFields = (
  schema: Record<string, unknown>
): Array<{
  name: string;
  label: string;
  type: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}> => {
  const fields: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
    enum?: string[];
    default?: unknown;
  }> = [];

  // Handle JSON Schema structure
  // Schema might be wrapped in { type: "object", properties: {...} } or just be the properties object
  let properties: Record<string, any>;
  if (schema.properties) {
    properties = schema.properties as Record<string, any>;
  } else if (schema.type === "object" || Object.keys(schema).length === 0) {
    // Empty object or object type without properties
    properties = {};
  } else {
    // Assume the schema itself is the properties object
    properties = schema as Record<string, any>;
  }
  const required = (schema.required as string[]) || [];

  for (const [key, prop] of Object.entries(properties)) {
    const propSchema = prop as Record<string, any>;
    const fieldType = propSchema.type || "string";

    // Map JSON Schema types to HTML input types
    let inputType = "text";
    if (fieldType === "number" || fieldType === "integer") {
      inputType = "number";
    } else if (fieldType === "boolean") {
      inputType = "checkbox";
    } else if (fieldType === "string" && propSchema.format === "url") {
      inputType = "url";
    }

    fields.push({
      name: key,
      label: propSchema.title || key,
      type: inputType,
      required: required.includes(key),
      enum: propSchema.enum,
      default: propSchema.default,
    });
  }

  return fields;
};

export const ToolFormModal = ({
  tool,
  isOpen,
  onClose,
  onSubmit,
}: ToolFormModalProps) => {
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  if (!isOpen || !tool) return null;

  const fields = generateFormFields(tool.inputSchema);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    // Convert form values to appropriate types based on schema
    const properties =
      (tool.inputSchema.properties as Record<string, any>) || {};
    const processedData: Record<string, unknown> = {};

    for (const field of fields) {
      const propSchema = properties[field.name];
      const fieldType = propSchema?.type || "string";
      let value = formData[field.name];

      // Handle default values
      if (value === undefined || value === "") {
        if (propSchema?.default !== undefined) {
          value = propSchema.default;
        } else if (!field.required) {
          continue; // Skip optional fields with no value
        }
      }

      // Type conversion
      if (fieldType === "number" || fieldType === "integer") {
        value = value !== undefined && value !== "" ? Number(value) : undefined;
      } else if (fieldType === "boolean") {
        value = Boolean(value);
      }

      if (value !== undefined) {
        processedData[field.name] = value;
      }
    }

    onSubmit(tool.name, processedData);
    setFormData({});
    onClose();
  };

  const handleChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">{tool.name}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-4">{tool.description}</p>

          <div className="mb-4 p-2 bg-purple-50 rounded">
            <span className="text-xs font-semibold text-purple-700">
              Cost: {formatPrice(tool.price.amount, tool.price.asset)}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                This tool has no input parameters.
              </p>
            ) : (
              fields.map((field) => (
                <div key={field.name}>
                  <label
                    htmlFor={field.name}
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {field.label}
                    {field.required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>

                  {field.enum ? (
                    <select
                      id={field.name}
                      required={field.required}
                      value={(formData[field.name] as string) || ""}
                      onChange={(e) => handleChange(field.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select...</option>
                      {field.enum.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      id={field.name}
                      checked={Boolean(formData[field.name])}
                      onChange={(e) =>
                        handleChange(field.name, e.target.checked)
                      }
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                  ) : (
                    <input
                      type={field.type}
                      id={field.name}
                      required={field.required}
                      value={(formData[field.name] as string) || ""}
                      onChange={(e) => {
                        const value =
                          field.type === "number"
                            ? e.target.valueAsNumber
                            : e.target.value;
                        handleChange(field.name, value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder={field.default ? String(field.default) : ""}
                    />
                  )}
                </div>
              ))
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                Execute Tool
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
