// npm run generate -- --sync
// npm run generate "ModuleName"

const fs = require("fs");
const path = require("path");
const { getDMMF } = require("@prisma/internals");

/* =========================
 * PATHS (AUTO-ROBUST)
 * ========================= */
const CWD = process.cwd(); // project root
const SRC_DIR = path.join(CWD, "src");

const MODULES_DIR = path.join(SRC_DIR, "app", "modules");
const ROUTES_INDEX_PATH = path.join(SRC_DIR, "app", "routes", "index.ts");
const PRISMA_SCHEMA_PATH = path.join(CWD, "prisma", "schema.prisma");

/* =========================
 * UTILS
 * ========================= */
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const pluralize = (str) => `${str}s`;

const fileExists = (p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};

const readFile = (p) => fs.readFileSync(p, "utf8");
const writeFile = (p, content) => fs.writeFileSync(p, content, "utf8");

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Convert fieldName -> "Field name" (for messages) */
const toLabel = (name) =>
  name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

/**
 * Ensures a named/default import exists without duplicating.
 * Also removes duplicates for the same module specifier.
 *
 * Supports:
 *  - import X from "m";
 *  - import { A, B } from "m";
 *  - import X, { A, B } from "m";
 */
const ensureImportSmart = (content, spec) => {
  const { modulePath, defaultImport, namedImports = [] } = spec;

  // Find ALL import lines from same modulePath (both ' and ")
  const fromRe = new RegExp(
    `^import\\s+[^;]*\\s+from\\s+["']${escapeRegExp(modulePath)}["'];\\s*$`,
    "gm"
  );

  const existingImports = [...content.matchAll(fromRe)].map((m) => m[0]);

  const parseImportLine = (line) => {
    const re = new RegExp(
      `^import\\s+(.+)\\s+from\\s+["']${escapeRegExp(modulePath)}["'];\\s*$`
    );
    const m = line.match(re);
    if (!m) return null;
    const clause = m[1].trim();

    let def = null;
    let named = [];

    // default + named: X, { A, B }
    const both = clause.match(/^([A-Za-z_$][\w$]*)\s*,\s*\{([^}]+)\}$/);
    if (both) {
      def = both[1].trim();
      named = both[2]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return { def, named };
    }

    // only named: { A, B }
    const onlyNamed = clause.match(/^\{([^}]+)\}$/);
    if (onlyNamed) {
      named = onlyNamed[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return { def, named };
    }

    // only default: X
    const onlyDefault = clause.match(/^([A-Za-z_$][\w$]*)$/);
    if (onlyDefault) {
      def = onlyDefault[1].trim();
      return { def, named: [] };
    }

    return { def: null, named: [] };
  };

  // Merge existing + requested into one
  let mergedDefault = defaultImport || null;
  const mergedNamed = new Set(namedImports);

  for (const line of existingImports) {
    const parsed = parseImportLine(line);
    if (!parsed) continue;

    if (!mergedDefault && parsed.def) mergedDefault = parsed.def;
    parsed.named.forEach((n) => mergedNamed.add(n));
  }

  // Remove all existing imports from this modulePath
  content = content.replace(fromRe, "").replace(/\n{3,}/g, "\n\n");

  // Build final import
  const namedPart =
    mergedNamed.size > 0 ? `{ ${[...mergedNamed].sort().join(", ")} }` : null;

  let finalLine = null;
  if (mergedDefault && namedPart) {
    finalLine = `import ${mergedDefault}, ${namedPart} from "${modulePath}";`;
  } else if (mergedDefault) {
    finalLine = `import ${mergedDefault} from "${modulePath}";`;
  } else if (namedPart) {
    finalLine = `import ${namedPart} from "${modulePath}";`;
  } else {
    return content;
  }

  // Insert after last import
  const importRegex = /^import .*;$/gm;
  const imports = [...content.matchAll(importRegex)];
  if (!imports.length) return `${finalLine}\n${content}`;

  const last = imports[imports.length - 1];
  const idx = last.index + last[0].length;
  return content.slice(0, idx) + "\n" + finalLine + content.slice(idx);
};

const isObjectIdField = (schemaText, modelName, fieldName) => {
  const modelBlockRe = new RegExp(
    `model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`,
    "m"
  );
  const match = schemaText.match(modelBlockRe);
  if (!match) return false;

  const block = match[1];
  const fieldLineRe = new RegExp(
    `^\\s*${fieldName}\\s+\\w+[\\?\\[\\]\\s\\w@()".:]*@db\\.ObjectId`,
    "m"
  );
  return fieldLineRe.test(block);
};

const toObjectIdZod = (label) =>
  `z.string({
    required_error: "${label} is required",
    invalid_type_error: "${label} must be a text value"
  }).regex(/^[0-9a-fA-F]{24}$/, "Invalid ${label}")`;

const scalarToZod = ({ type, isList, label, requiredInCreate }) => {
  const reqMsg = `${label} is required`;

  const wrapArray = (inner) =>
    `z.array(${inner}, {
      required_error: "${reqMsg}",
      invalid_type_error: "${label} must be an array"
    })`;

  let base;
  switch (type) {
    case "String": {
      base = `z.string({
        required_error: "${reqMsg}",
        invalid_type_error: "${label} must be a text value"
      })${requiredInCreate ? `.min(1, "${reqMsg}")` : ""}`;
      break;
    }
    case "Int": {
      base = `z.number({
        required_error: "${reqMsg}",
        invalid_type_error: "${label} must be a number"
      }).int("${label} must be an integer")`;
      break;
    }
    case "Float": {
      base = `z.number({
        required_error: "${reqMsg}",
        invalid_type_error: "${label} must be a number"
      })`;
      break;
    }
    case "Boolean": {
      base = `z.boolean({
        required_error: "${reqMsg}",
        invalid_type_error: "${label} must be true/false"
      })`;
      break;
    }
    case "DateTime": {
      base = `z.coerce.date({
        required_error: "${reqMsg}",
        invalid_type_error: "Please provide a valid ${label}"
      })`;
      break;
    }
    default:
      base = null;
  }
  if (!base) return null;
  return isList ? wrapArray(base) : base;
};

const enumToZod = ({ enumName, isList, label }) => {
  const base = `z.nativeEnum(${enumName}, {
    errorMap: () => ({ message: "Please select a valid ${label}" })
  })`;

  if (!isList) return base;

  return `z.array(${base}, {
    required_error: "${label} is required",
    invalid_type_error: "${label} must be an array"
  })`;
};

const shouldSkipField = (f) => {
  // auto/system fields
  if (["id", "createdAt", "updatedAt"].includes(f.name)) return true;

  // ✅ don't validate userId coming from client (comes from auth)
  if (f.name === "userId") return true;

  // ✅ don't validate createdBy coming from client
  if (f.name === "createdBy") return true;

  // relations
  if (f.kind === "object") return true;

  return false;
};

const readPrismaSchema = () => {
  if (!fileExists(PRISMA_SCHEMA_PATH)) {
    throw new Error(`schema.prisma not found at: ${PRISMA_SCHEMA_PATH}`);
  }
  return readFile(PRISMA_SCHEMA_PATH);
};

/* =========================
 * PRISMA -> ZOD GENERATION
 * ========================= */
const getModelFromDmmf = async (modelName) => {
  const schemaText = readPrismaSchema();
  const dmmf = await getDMMF({ datamodel: schemaText });

  const model = dmmf.datamodel.models.find(
    (m) => m.name.toLowerCase() === modelName.toLowerCase()
  );

  if (!model) {
    throw new Error(`Prisma model '${modelName}' not found in schema.prisma`);
  }

  return { model, schemaText };
};

const buildZodShape = ({ model, schemaText }, mode /* 'create'|'update' */) => {
  const lines = [];

  for (const f of model.fields) {
    if (shouldSkipField(f)) continue;

    const isList = !!f.isList;
    const requiredInCreate = !!f.isRequired && !f.hasDefaultValue;
    const optional = mode === "update" ? true : !requiredInCreate;

    const label = toLabel(f.name);

    let zodExpr = null;

    // Mongo ObjectId validation for String @db.ObjectId
    if (
      f.kind === "scalar" &&
      f.type === "String" &&
      isObjectIdField(schemaText, model.name, f.name)
    ) {
      const base = toObjectIdZod(label);
      zodExpr = isList
        ? `z.array(${base}, {
            required_error: "${label} is required",
            invalid_type_error: "${label} must be an array"
          })`
        : base;
    } else if (f.kind === "enum") {
      zodExpr = enumToZod({ enumName: f.type, isList, label });
    } else if (f.kind === "scalar") {
      zodExpr = scalarToZod({
        type: f.type,
        isList,
        label,
        requiredInCreate,
      });
    }

    if (!zodExpr) continue;

    // If required list in create, force non-empty
    if (!optional && isList) {
      zodExpr += `.min(1, "Please select at least one ${label.toLowerCase()}")`;
    }

    if (optional) zodExpr = `${zodExpr}.optional()`;

    lines.push(`  ${f.name}: ${zodExpr},`);
  }

  return lines.join("\n");
};

const generateValidationFileContent = async (modelName, exportName) => {
  const { model, schemaText } = await getModelFromDmmf(modelName);

  const createShape = buildZodShape({ model, schemaText }, "create");
  const updateShape = buildZodShape({ model, schemaText }, "update");

  // collect enum names used in model
  const enumNames = [
    ...new Set(model.fields.filter((f) => f.kind === "enum").map((f) => f.type)),
  ];

  const enumImports = enumNames.length ? `, ${enumNames.join(", ")}` : "";

  return `
import { z } from 'zod';
import { Prisma${enumImports} } from '@prisma/client';

// Auto-generated from Prisma model: ${modelName}
const createSchema = z.object({
${createShape || "  // no scalar fields to validate"}
}).strict();

const updateSchema = z.object({
${updateShape || "  // no scalar fields to validate"}
}).strict();

export const ${exportName} = {
  createSchema,
  updateSchema,
};
`.trim();
};

/* =========================
 * ROUTES PATCHER (POST/PUT)
 * ========================= */
const findRoutesFilePath = (moduleDir, moduleName) => {
  const candidates = [
    path.join(moduleDir, `${moduleName}.routes.ts`),
    path.join(moduleDir, `${moduleName}.route.ts`),
  ];
  for (const c of candidates) if (fileExists(c)) return c;

  const files = fs.readdirSync(moduleDir);
  const found = files.find(
    (f) => f.endsWith(".routes.ts") || f.endsWith(".route.ts")
  );
  return found ? path.join(moduleDir, found) : null;
};

const patchCrudValidation = ({
  fileContent,
  method, // "post" | "put" | "patch"
  validationExportName,
  schemaKey, // "createSchema" | "updateSchema"
  onlyPaths, // array of exact paths that are allowed to be patched
}) => {
  const routeRegex = new RegExp(
    `router\\.${method}\\(\\s*(['"\`])([^'"\`]+)\\1\\s*,([\\s\\S]*?)\\)\\s*;`,
    "gm"
  );

  return fileContent.replace(routeRegex, (full, quote, routePath, rest) => {
    if (!onlyPaths.includes(routePath)) return full;
    if (full.includes("validateRequest(")) return full;

    if (rest.includes("auth()")) {
      const replacedRest = rest.replace(
        /auth\(\)\s*,/,
        `auth(), validateRequest(${validationExportName}.${schemaKey}),`
      );
      return `router.${method}(${quote}${routePath}${quote},${replacedRest});`;
    }

    return `router.${method}(${quote}${routePath}${quote}, validateRequest(${validationExportName}.${schemaKey}),${rest});`;
  });
};

const ensureValidationInRoutes = (moduleDir, moduleName) => {
  const routesPath = findRoutesFilePath(moduleDir, moduleName);
  if (!routesPath) return;

  let content = readFile(routesPath);

  // normalize + dedupe validateRequest import
  content = ensureImportSmart(content, {
    modulePath: "../../middlewares/validateRequest",
    defaultImport: "validateRequest",
  });

  const validationExportName = `${moduleName.toLowerCase()}Validation`;

  // normalize + dedupe validation import
  content = ensureImportSmart(content, {
    modulePath: `./${moduleName.toLowerCase()}.validation`,
    namedImports: [validationExportName],
  });

  content = patchCrudValidation({
    fileContent: content,
    method: "post",
    validationExportName,
    schemaKey: "createSchema",
    onlyPaths: ["/"],
  });

  content = patchCrudValidation({
    fileContent: content,
    method: "put",
    validationExportName,
    schemaKey: "updateSchema",
    onlyPaths: ["/:id"],
  });

  content = patchCrudValidation({
    fileContent: content,
    method: "patch",
    validationExportName,
    schemaKey: "updateSchema",
    onlyPaths: ["/:id"],
  });

  writeFile(routesPath, content);
  console.log(`✅ Patched routes validation: ${path.relative(CWD, routesPath)}`);
};

/* =========================
 * VALIDATION SYNC FOR EXISTING MODULES
 * =========================
 * overwrite = false => only create validation if missing
 * overwrite = true  => always rewrite validation to match Prisma
 */
const syncValidationsForExistingModules = async ({ overwrite = false } = {}) => {
  if (!fileExists(MODULES_DIR)) {
    console.log("⚠️ modules directory not found:", MODULES_DIR);
    return;
  }

  const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const folderName of dirs) {
    const moduleDir = path.join(MODULES_DIR, folderName);

    const moduleName = folderName;
    const prismaModelName = capitalize(folderName);

    const validationFilePath = path.join(
      moduleDir,
      `${moduleName.toLowerCase()}.validation.ts`
    );

    try {
      // always patch routes (safe)
      ensureValidationInRoutes(moduleDir, moduleName);

      // create/overwrite validation only based on flag
      const shouldWrite = overwrite || !fileExists(validationFilePath);
      if (!shouldWrite) continue;

      const validationExportName = `${moduleName.toLowerCase()}Validation`;
      const validationContent = await generateValidationFileContent(
        prismaModelName,
        validationExportName
      );

      writeFile(validationFilePath, validationContent);

      console.log(
        overwrite
          ? `✅ Synced validation (overwritten): ${path.relative(
              CWD,
              validationFilePath
            )}`
          : `✅ Created missing validation: ${path.relative(
              CWD,
              validationFilePath
            )}`
      );
    } catch (e) {
      console.log(`⚠️ Skip '${folderName}': ${e.message}`);
    }
  }
};

/* =========================
 * TEMPLATES (NEW MODULE)
 * ========================= */
const templates = async (moduleName) => {
  const Capitalized = capitalize(moduleName);

  const validationExportName = `${moduleName.toLowerCase()}Validation`;
  const prismaModelName = capitalize(moduleName);

  return {
    controller: `
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { ${moduleName}Service } from './${moduleName}.service';
import { Request, Response } from 'express';
import pick from '../../../shared/pick';

// create ${Capitalized}
const create${Capitalized} = catchAsync(async (req: Request, res: Response) => {
  const data = req.body;
  const result = await ${moduleName}Service.create${Capitalized}(data);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: '${Capitalized} created successfully',
    data: result,
  });
});

// get all ${Capitalized}
const ${moduleName}FilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
];
const get${Capitalized}List = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, ${moduleName}FilterableFields);
  const result = await ${moduleName}Service.get${Capitalized}List(options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${Capitalized} list retrieved successfully',
    data: result,
  });
});

// get ${Capitalized} by userId
const get${Capitalized}ByUserId = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await ${moduleName}Service.get${Capitalized}ByUserId(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${Capitalized} details retrieved successfully',
    data: result,
  });
});

// get ${Capitalized} by id
const get${Capitalized}ById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ${moduleName}Service.get${Capitalized}ById(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${Capitalized} retrieved successfully',
    data: result,
  });
});

// update ${Capitalized}
const update${Capitalized} = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body;
  const result = await ${moduleName}Service.update${Capitalized}(id, data);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${Capitalized} updated successfully',
    data: result,
  });
});

// delete ${Capitalized}
const delete${Capitalized} = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ${moduleName}Service.delete${Capitalized}(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: '${Capitalized} deleted successfully',
    data: result,
  });
});

export const ${moduleName}Controller = {
  create${Capitalized},
  get${Capitalized}List,
  get${Capitalized}ByUserId,
  get${Capitalized}ById,
  update${Capitalized},
  delete${Capitalized},
};
`.trim(),

    service: `
import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import { Prisma } from "@prisma/client";

// create ${Capitalized}
const create${Capitalized} = async (data: any) => {
  const result = await prisma.${moduleName}.create({
    data
  });
  return result;
};

// get all ${Capitalized}
type I${Capitalized}FilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
};
const ${moduleName}SearchAbleFields = ['fullName', 'email', 'userName'];

const get${Capitalized}List = async (
  options: IPaginationOptions,
  filters: I${Capitalized}FilterRequest
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.${Capitalized}WhereInput[] = [];

  if (searchTerm) {
    andConditions.push({
      OR: [
        ...${moduleName}SearchAbleFields.map((field) => ({
          [field]: {
            contains: searchTerm,
            mode: "insensitive",
          },
        })),
      ],
    });
  }
  if (Object.keys(filterData).length) {
    Object.keys(filterData).forEach((key) => {
      const value = (filterData as any)[key];
      if (value === "" || value === null || value === undefined) return;
      if (["createdAt"].includes(key) && value) {
        const start = new Date(value);
        start.setHours(0, 0, 0, 0);
        const end = new Date(value);
        end.setHours(23, 59, 59, 999);
        andConditions.push({
          createdAt: {
            gte: start.toISOString(),
            lte: end.toISOString(),
          },
        });
        return;
      }
      // if (key === "status") {
      //   const statuses = Array.isArray(value) ? value : [value];
      //   andConditions.push({
      //     status: { in: statuses },
      //   });
      //   return;
      // }
      andConditions.push({ [key]: value });
    });
  }

  const whereConditions: Prisma.${Capitalized}WhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.${moduleName}.findMany({
    skip,
    take: limit,
    where: whereConditions,
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.${moduleName}.count({ where: whereConditions });

  return {
    meta: { total, page, limit },
    data: result,
  };
};

// get ${Capitalized} by user id
const get${Capitalized}ByUserId = async (userId: string) => {

  const result = await prisma.${moduleName}.findMany({ where: { userId } });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, '${Capitalized} not found');
  }

  return result;
};

// get ${Capitalized} by id
const get${Capitalized}ById = async (id: string) => {

  const existing${Capitalized} = await prisma.${moduleName}.findUnique({ where: { id } });

  if (!existing${Capitalized}) {
    throw new ApiError(httpStatus.NOT_FOUND, '${Capitalized} not found');
  }

  const result = await prisma.${moduleName}.findUnique({ where: { id } });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, '${Capitalized} not found');
  }

  return result;
};

// update ${Capitalized}
const update${Capitalized} = async (id: string, data: any) => {

  const existing${Capitalized} = await prisma.${moduleName}.findUnique({ where: { id } });

  if (!existing${Capitalized}) {
    throw new ApiError(httpStatus.NOT_FOUND, '${Capitalized} not found');
  }

  const result = await prisma.${moduleName}.update({
    where: { id },
    data
  });

  return result;
};

// delete ${Capitalized}
const delete${Capitalized} = async (id: string) => {

  const result = await prisma.${moduleName}.delete({ where: { id } });

  return result;
};

export const ${moduleName}Service = {
  create${Capitalized},
  get${Capitalized}List,
  get${Capitalized}ByUserId,
  get${Capitalized}ById,
  update${Capitalized},
  delete${Capitalized},
};
`.trim(),

    routes: `
import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { ${moduleName}Controller } from './${moduleName}.controller';
import { ${validationExportName} } from './${moduleName}.validation';

const router = express.Router();

router.post('/', auth(), validateRequest(${validationExportName}.createSchema), ${moduleName}Controller.create${Capitalized});

router.get('/', auth(), ${moduleName}Controller.get${Capitalized}List);

router.get('/get/by/userId', auth(), ${moduleName}Controller.get${Capitalized}ByUserId);

router.get('/:id', auth(), ${moduleName}Controller.get${Capitalized}ById);

router.put('/:id',auth(),validateRequest(${validationExportName}.updateSchema),${moduleName}Controller.update${Capitalized});

router.delete('/:id', auth(), ${moduleName}Controller.delete${Capitalized});

export const ${moduleName}Routes = router;
`.trim(),

    validation: await generateValidationFileContent(
      prismaModelName,
      validationExportName
    ),
  };
};

/* =========================
 * ROUTE REGISTRATION (INDEX)
 * ========================= */
const registerRoute = (moduleName) => {
  if (!fileExists(ROUTES_INDEX_PATH)) {
    console.error("❌ routes index.ts not found:", ROUTES_INDEX_PATH);
    return;
  }

  const routeVar = `${moduleName}Routes`;
  const routePath = `/${pluralize(moduleName.toLowerCase())}`;
  const importStatement = `import { ${routeVar} } from "../modules/${moduleName}/${moduleName}.routes";`;

  let fileContent = readFile(ROUTES_INDEX_PATH);

  if (fileContent.includes(importStatement)) {
    console.log("⚠️ Route already registered, skipping...");
    return;
  }

  const importRegex = /^import .*;$/gm;
  const imports = [...fileContent.matchAll(importRegex)];
  if (imports.length === 0) {
    console.error("❌ No import statements found in routes index.ts");
    return;
  }

  const lastImport = imports[imports.length - 1];
  const insertImportIndex = lastImport.index + lastImport[0].length;

  fileContent =
    fileContent.slice(0, insertImportIndex) +
    "\n" +
    importStatement +
    fileContent.slice(insertImportIndex);

  const routesArrayEndIndex = fileContent.indexOf(
    "];",
    fileContent.indexOf("const moduleRoutes")
  );

  if (routesArrayEndIndex === -1) {
    console.error("❌ moduleRoutes array not found in routes index.ts");
    return;
  }

  const routeEntry = `
  {
    path: "${routePath}",
    route: ${routeVar},
  },`;

  fileContent =
    fileContent.slice(0, routesArrayEndIndex) +
    routeEntry +
    "\n" +
    fileContent.slice(routesArrayEndIndex);

  writeFile(ROUTES_INDEX_PATH, fileContent);
  console.log(`✅ Route registered: ${routePath}`);
};

/* =========================
 * MAIN GENERATOR
 * ========================= */
const generateModule = async (moduleName) => {
  if (!moduleName) {
    console.error("❌ Please provide a module name!");
    process.exit(1);
  }

  if (!fileExists(MODULES_DIR)) fs.mkdirSync(MODULES_DIR, { recursive: true });

  const modulePath = path.join(MODULES_DIR, moduleName);
  if (fileExists(modulePath)) {
    console.error(`❌ Module '${moduleName}' already exists!`);
    process.exit(1);
  }

  fs.mkdirSync(modulePath, { recursive: true });

  const tpl = await templates(moduleName);

  Object.entries(tpl).forEach(([key, content]) => {
    const filePath = path.join(modulePath, `${moduleName}.${key}.ts`);
    writeFile(filePath, content.trim());
    console.log(`✅ Created: ${path.relative(CWD, filePath)}`);
  });

  registerRoute(moduleName);
  console.log(`🎉 Module '${moduleName}' created successfully!`);
};

/* =========================
 * CLI
 * ========================= */
const args = process.argv.slice(2);
const first = args[0];

(async () => {
  try {
    // ✅ Only on --sync we overwrite all validations
    if (first === "--sync") {
      await syncValidationsForExistingModules({ overwrite: true });
      console.log("✅ Sync completed!");
      return;
    }

    // ✅ Normal generate: ONLY create requested module, do not touch others
    const moduleName = first;
    if (!moduleName) {
      console.error(
        '❌ Please provide a module name! (ex: npm run generate Room OR npm run generate -- --sync)'
      );
      process.exit(1);
    }

    await generateModule(moduleName);

    // ✅ IMPORTANT: removed global sync step here to avoid touching other modules
    return;
  } catch (e) {
    console.error("❌ Generate failed:", e.message);
    process.exit(1);
  }
})();