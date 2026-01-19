// controllers/emailTemplateController.js
import EmailTemplate from "../models/EmailTemplate.js";

/*
 * CONTROLLER FUNCTIONS
 * Handles all CRUD operations for email templates
 */

//   CREATE  
export const createTemplate = async (req, res) => {
  try {
    const { name, type, components, emailSubject } = req.body;
    
    // Validation
    if (!name || !type || !components || components.length === 0) {
      return res.status(400).json({ 
        error: 'Name, type, and at least one component are required' 
      });
    }

    // Check if active template of this type already exists
    const existingActive = await EmailTemplate.findOne({ 
      type, 
      isActive: true 
    });

    // Create new template
    const template = new EmailTemplate({
      name,
      type,
      components,
      emailSubject: emailSubject || `${type.charAt(0).toUpperCase() + type.slice(1)} Notification`,
      isActive: !existingActive, // Auto-activate if no active template exists
      createdBy: req.admin?._id, // From auth middleware
      lastModifiedBy: req.admin?._id
    });

    await template.save();

    console.log('✅ Email template created:', template.name);

    res.status(201).json({
      message: 'Template created successfully',
      template
    });

  } catch (error) {
    console.error('❌ Create template error:', error);
    res.status(500).json({ 
      error: 'Failed to create template',
      details: error.message 
    });
  }
};

//   GET ALL  
export const getAllTemplates = async (req, res) => {
  try {
    const { type, isActive } = req.query;
    
    // Build filter
    const filter = {};
    if (type) filter.type = type;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const templates = await EmailTemplate.find(filter)
      .sort({ updatedAt: -1 }) // Most recent first
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email');

    res.json({
      count: templates.length,
      templates
    });

  } catch (error) {
    console.error('❌ Get templates error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch templates',
      details: error.message 
    });
  }
};

//   GET ONE  
export const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await EmailTemplate.findById(id)
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email');

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });

  } catch (error) {
    console.error('❌ Get template error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch template',
      details: error.message 
    });
  }
};

//   GET ACTIVE BY TYPE  
export const getActiveTemplateByType = async (req, res) => {
  try {
    const { type } = req.params;

    const template = await EmailTemplate.getActiveTemplate(type);

    if (!template) {
      return res.status(404).json({ 
        error: `No active ${type} template found` 
      });
    }

    res.json({ template });

  } catch (error) {
    console.error('❌ Get active template error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch active template',
      details: error.message 
    });
  }
};

//   UPDATE  
export const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, components, emailSubject, isActive } = req.body;

    const template = await EmailTemplate.findById(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Update fields
    if (name) template.name = name;
    if (components) template.components = components;
    if (emailSubject) template.emailSubject = emailSubject;
    if (isActive !== undefined) template.isActive = isActive;
    
    template.lastModifiedBy = req.admin?._id;

    await template.save();

    console.log('✅ Template updated:', template.name);

    res.json({
      message: 'Template updated successfully',
      template
    });

  } catch (error) {
    console.error('❌ Update template error:', error);
    res.status(500).json({ 
      error: 'Failed to update template',
      details: error.message 
    });
  }
};

//   TOGGLE ACTIVE STATUS  
export const toggleTemplateStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await EmailTemplate.findById(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // If activating, deactivate other templates of same type
    if (!template.isActive) {
      await EmailTemplate.updateMany(
        { type: template.type, _id: { $ne: id } },
        { isActive: false }
      );
    }

    template.isActive = !template.isActive;
    template.lastModifiedBy = req.admin?._id;
    await template.save();

    console.log(`✅ Template ${template.isActive ? 'activated' : 'deactivated'}:`, template.name);

    res.json({
      message: `Template ${template.isActive ? 'activated' : 'deactivated'}`,
      template
    });

  } catch (error) {
    console.error('❌ Toggle status error:', error);
    res.status(500).json({ 
      error: 'Failed to toggle template status',
      details: error.message 
    });
  }
};

//   DELETE  
export const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await EmailTemplate.findById(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Prevent deletion of active templates
    if (template.isActive) {
      return res.status(400).json({ 
        error: 'Cannot delete active template. Deactivate it first.' 
      });
    }

    await template.deleteOne();

    console.log('✅ Template deleted:', template.name);

    res.json({
      message: 'Template deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete template error:', error);
    res.status(500).json({ 
      error: 'Failed to delete template',
      details: error.message 
    });
  }
};

//   CLONE TEMPLATE  
export const cloneTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const originalTemplate = await EmailTemplate.findById(id);

    if (!originalTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const clonedTemplate = originalTemplate.cloneTemplate();
    clonedTemplate.createdBy = req.admin?._id;
    clonedTemplate.lastModifiedBy = req.admin?._id;
    
    await clonedTemplate.save();

    console.log('✅ Template cloned:', clonedTemplate.name);

    res.status(201).json({
      message: 'Template cloned successfully',
      template: clonedTemplate
    });

  } catch (error) {
    console.error('❌ Clone template error:', error);
    res.status(500).json({ 
      error: 'Failed to clone template',
      details: error.message 
    });
  }
};

/*
 * DOCUMENTATION:
 * 
 * These controllers handle all operations for email templates:
 * 
 * 1. CREATE - Admin creates new template from UI
 * 2. GET ALL - View all templates (with filters)
 * 3. GET ONE - View single template details
 * 4. UPDATE - Modify existing template
 * 5. TOGGLE - Activate/deactivate template
 * 6. DELETE - Remove template (only if inactive)
 * 7. CLONE - Duplicate existing template
 * 
 * SECURITY:
 * - All routes require admin authentication
 * - Track who created/modified templates
 * - Prevent deletion of active templates
 * - Auto-deactivate others when activating one
 */