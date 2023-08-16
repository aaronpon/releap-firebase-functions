import { Response } from 'express'

export class CustomError extends Error {
    constructor(message: string, public status: number) {
        super(message)
    }
}

export class AuthError extends CustomError {
    constructor(message: string) {
        super(message, 401)
    }
}

export class NotFoundError extends CustomError {
    constructor(message = 'Not found') {
        super(message, 404)
    }
}

export class BadRequest extends CustomError {
    constructor(message: string) {
        super(message, 400)
    }
}

export class ForbiddenError extends CustomError {
    constructor(message = 'Forbidden') {
        super(message, 403)
    }
}

export class ServerError extends CustomError {
    constructor(message = 'Internal Server Error') {
        super(message, 500)
    }
}

export function errorHandler(error: unknown, res: Response) {
    if (error instanceof CustomError) {
        res.status(error.status).json({ error: error.message })
    } else {
        res.status(500).json({ message: 'internal server error' })
    }
}
