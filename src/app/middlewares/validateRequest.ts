import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";

const validateRequest =
  (schema: ZodTypeAny) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        req.body = req.body.data ? JSON.parse(req.body.data) : req.body;
        await schema.parseAsync(req.body);
        return next();
      } catch (err) {
        next(err);
      }
    };

export default validateRequest;
