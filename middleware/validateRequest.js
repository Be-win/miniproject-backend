const Joi = require('joi');

const validateRequest = (req, res, next) => {
    const schema = Joi.object({
        name: Joi.string().required().messages({
            'any.required': 'Name is required',
            'string.empty': 'Name cannot be empty'
        }),
        description: Joi.string().allow('').optional(),
        address: Joi.string().required().messages({
            'any.required': 'Address is required',
            'string.empty': 'Address cannot be empty'
        }),
        latitude: Joi.number().min(-90).max(90).required().messages({
            'number.base': 'Latitude must be a number',
            'number.min': 'Latitude must be between -90 and 90',
            'number.max': 'Latitude must be between -90 and 90',
            'any.required': 'Latitude is required'
        }),
        longitude: Joi.number().min(-180).max(180).required().messages({
            'number.base': 'Longitude must be a number',
            'number.min': 'Longitude must be between -180 and 180',
            'number.max': 'Longitude must be between -180 and 180',
            'any.required': 'Longitude is required'
        }),
        total_land: Joi.number().positive().required().messages({
            'number.base': 'Total land must be a number',
            'number.positive': 'Total land must be a positive number',
            'any.required': 'Total land is required'
        }),
        type: Joi.string().valid('community', 'rent', 'charity').default('community'),
        images: Joi.array().items(Joi.string().uri()).optional(),
        soil_type: Joi.string().allow('').optional(),
        irrigation: Joi.boolean().default(false),
        electricity: Joi.boolean().default(false),
        previous_crops: Joi.string().allow('').optional()
    });

    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return res.status(400).json({ errors });
    }

    next();
};

module.exports = validateRequest;