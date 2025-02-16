const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticateToken');
const Resource = require('../models/resourceModel');
const { v4: uuidv4 } = require('uuid');

// Get resources with filtering
router.get('/', authenticate, async (req, res) => {
    try {
        const { filter = 'all' } = req.query;
        const resources = await Resource.getResources(filter, req.user.id);
        res.json(resources);
    } catch (error) {
        console.error('Error fetching resources:', error);
        res.status(500).json({ error: 'Failed to fetch resources' });
    }
});

// Create new resource
router.post('/', authenticate, async (req, res) => {
    try {
        const resourceData = {
            id: uuidv4(),
            ...req.body,
            owner_id: req.user.id
        };

        const newResource = await Resource.createResource(resourceData);
        res.status(201).json(newResource);
    } catch (error) {
        console.error('Error creating resource:', error);
        res.status(500).json({ error: 'Failed to create resource' });
    }
});

// Delete resource
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const deletedResource = await Resource.deleteResource(
            req.params.id,
            req.user.id
        );

        if (!deletedResource) {
            return res.status(404).json({ error: 'Resource not found' });
        }

        res.json({ message: 'Resource deleted successfully' });
    } catch (error) {
        console.error('Error deleting resource:', error);
        res.status(500).json({ error: 'Failed to delete resource' });
    }
});

// Create resource request
router.post('/requests', authenticate, async (req, res) => {
    try {
        const requestData = {
            id: uuidv4(),
            ...req.body,
            requester_id: req.user.id
        };

        const newRequest = await Resource.createResourceRequest(requestData);
        res.status(201).json(newRequest);
    } catch (error) {
        console.error('Error creating resource request:', error);
        res.status(500).json({ error: 'Failed to create request' });
    }
});

// Update request status
router.patch('/requests/:requestId', authenticate, async (req, res) => {
    try {
        const { status } = req.body;
        const updatedRequest = await Resource.updateRequestStatus(
            req.params.requestId,
            status
        );

        if (!updatedRequest) {
            return res.status(404).json({ error: 'Request not found' });
        }

        res.json(updatedRequest);
    } catch (error) {
        console.error('Error updating request status:', error);
        res.status(500).json({ error: 'Failed to update request status' });
    }
});

module.exports = router;