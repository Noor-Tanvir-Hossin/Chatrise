

import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';


const notFound = (req: Request, res: Response, next: NextFunction) => {
  return res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: `Can't find ${req.originalUrl} on this server!`,
    error: '',
  });
};

export default notFound;