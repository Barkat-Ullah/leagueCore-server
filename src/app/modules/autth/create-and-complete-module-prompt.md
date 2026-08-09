Create and complete a new backend module using the coach module structure.

- Files:
  - src/app/modules/<moduleName>/<moduleName>.routes.ts
  - src/app/modules/<moduleName>/<moduleName>.controller.ts
  - src/app/modules/<moduleName>/<moduleName>.service.ts
  - src/app/modules/<moduleName>/<moduleName>.validation.ts

- Route file:
  - import express, auth, validateRequest, fileUploader, controller, validation
  - protect all routes with auth()
  - use fileUploader.uploadSingle on POST / and PUT /:id if model supports image upload
  - validate create/update with zod schemas

- Controller:
  - use catchAsync
  - call service methods
  - send response with sendResponse
  - implement:
    - create<Module>
    - get<Module>List
    - get<Module>ByUserId
    - update<Module>
    - delete<Module>

- Service create behavior:
  - if model has image field:
    - read req.file and req.body
    - upload image if present
  - if model has no image field:
    - use simple create style similar to review example:
      const createReview = async (userId, merchantId, data) => { ... }
  - always require user exists
  - if model has userId / createdById, create the record with createdById
  - include related existence checks before create
  - if extra business logic exists (eg. rating update, notification), include it after create

- Service update behavior:
  - accept full req for file + body handling
  - preserve existing fields if request fields are missing
  - upload image if present

- Validation:
  - use zod
  - create createSchema and updateSchema
  - use Prisma enums for enum fields

Follow the coach module naming, error handling, and response style exactly.
