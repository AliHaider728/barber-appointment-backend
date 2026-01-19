// routes/emailTemplates.js
import express from 'express';
import {
  createTemplate,
  getAllTemplates,
  getTemplateById,
  getActiveTemplateByType,
  updateTemplate,
  toggleTemplateStatus,
  deleteTemplate,
  cloneTemplate
} from '../controllers/emailTemplateController.js';
import { authenticateAdmin } from '../routes/auth.js';

const router = express.Router();

/*
 * EMAIL TEMPLATE ROUTES
 * All routes require admin authentication
 */

//   CREATE  
// POST /api/email-templates
// Body: { name, type, components, emailSubject }
router.post('/', authenticateAdmin, createTemplate);

//   GET ALL  
// GET /api/email-templates
// Query params: ?type=booking&isActive=true
router.get('/', authenticateAdmin, getAllTemplates);

//   GET ACTIVE BY TYPE  
// GET /api/email-templates/active/:type
// Params: type (booking, reminder, cancellation)
// Used by email service to fetch template
router.get('/active/:type', getActiveTemplateByType);

//   GET ONE  
// GET /api/email-templates/:id
router.get('/:id', authenticateAdmin, getTemplateById);

//   UPDATE  
// PUT /api/email-templates/:id
// Body: { name?, components?, emailSubject?, isActive? }
router.put('/:id', authenticateAdmin, updateTemplate);

//   TOGGLE STATUS  
// PATCH /api/email-templates/:id/toggle
router.patch('/:id/toggle', authenticateAdmin, toggleTemplateStatus);

//   CLONE  
// POST /api/email-templates/:id/clone
router.post('/:id/clone', authenticateAdmin, cloneTemplate);

//   DELETE  
// DELETE /api/email-templates/:id
router.delete('/:id', authenticateAdmin, deleteTemplate);

export default router;

/*
 * DOCUMENTATION:
 * 
 * ROUTE STRUCTURE:
 * 
 * Base URL: /api/email-templates
 * 
 * ENDPOINTS:
 * 
 * 1. POST /
 *    - Create new template
 *    - Auth: Required (Admin)
 *    - Body: { name, type, components, emailSubject }
 * 
 * 2. GET /
 *    - Get all templates (with optional filters)
 *    - Auth: Required (Admin)
 *    - Query: ?type=booking&isActive=true
 * 
 * 3. GET /active/:type
 *    - Get active template for specific type
 *    - Auth: Not required (used by email service)
 *    - Params: type (booking|reminder|cancellation|rescheduled)
 * 
 * 4. GET /:id
 *    - Get single template by ID
 *    - Auth: Required (Admin)
 * 
 * 5. PUT /:id
 *    - Update template
 *    - Auth: Required (Admin)
 *    - Body: { name?, components?, emailSubject?, isActive? }
 * 
 * 6. PATCH /:id/toggle
 *    - Toggle active/inactive status
 *    - Auth: Required (Admin)
 * 
 * 7. POST /:id/clone
 *    - Clone existing template
 *    - Auth: Required (Admin)
 * 
 * 8. DELETE /:id
 *    - Delete template (only if inactive)
 *    - Auth: Required (Admin)
 * 
 * USAGE EXAMPLES:
 * 
 * // Create template
 * POST /api/email-templates
 * Headers: { Authorization: "Bearer TOKEN" }
 * Body: {
 *   "name": "Booking Confirmation",
 *   "type": "booking",
 *   "components": [...],
 *   "emailSubject": "Your Booking is Confirmed!"
 * }
 * 
 * // Get all booking templates
 * GET /api/email-templates?type=booking
 * Headers: { Authorization: "Bearer TOKEN" }
 * 
 * // Get active booking template (for email service)
 * GET /api/email-templates/active/booking
 * (No auth required)
 * 
 * // Update template
 * PUT /api/email-templates/507f1f77bcf86cd799439011
 * Headers: { Authorization: "Bearer TOKEN" }
 * Body: {
 *   "name": "Updated Name",
 *   "components": [...]
 * }
 * 
 * // Toggle template status
 * PATCH /api/email-templates/507f1f77bcf86cd799439011/toggle
 * Headers: { Authorization: "Bearer TOKEN" }
 * 
 * // Clone template
 * POST /api/email-templates/507f1f77bcf86cd799439011/clone
 * Headers: { Authorization: "Bearer TOKEN" }
 * 
 * // Delete template
 * DELETE /api/email-templates/507f1f77bcf86cd799439011
 * Headers: { Authorization: "Bearer TOKEN" }
 */