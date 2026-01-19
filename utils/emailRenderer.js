// utils/emailRenderer.js
import EmailTemplate from '../models/EmailTemplate.js';

/*
 * EMAIL RENDERER SERVICE
 * Converts template components into HTML email
 */

//  MAIN RENDERER 
export const renderEmailFromTemplate = async (type, data) => {
  try {
    // Fetch active template
    const template = await EmailTemplate.getActiveTemplate(type);

    if (!template) {
      console.warn(`⚠️ No active ${type} template found, using fallback`);
      return generateFallbackEmail(type, data);
    }

    console.log(`📧 Rendering email from template: ${template.name}`);

    // Render each component
    const componentsHTML = template.components
      .map(component => renderComponent(component, data))
      .join('');

    // Wrap in email container
    const fullHTML = wrapInEmailContainer(componentsHTML);

    // Replace variables in subject
    const subject = replaceVariables(template.emailSubject, data);

    return {
      html: fullHTML,
      subject
    };

  } catch (error) {
    console.error('❌ Email rendering error:', error);
    // Fallback to basic email
    return generateFallbackEmail(type, data);
  }
};

//  COMPONENT RENDERER 
const renderComponent = (component, data) => {
  // Replace variables in content
  const content = replaceVariables(component.content, data);
  const style = styleToString(component.style);

  switch (component.type) {
    case 'header':
      return `
        <div style="${style}">
          <strong>${content}</strong>
        </div>
      `;

    case 'text':
      return `
        <div style="${style}">
          ${content}
        </div>
      `;

    case 'button':
      const link = replaceVariables(component.link || '#', data);
      return `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${link}" style="${style}; text-decoration: none; display: inline-block;">
            ${content}
          </a>
        </div>
      `;

    case 'image':
      return `
        <img src="${content}" alt="Email Image" style="${style}" />
      `;

    case 'divider':
      return `
        <hr style="${style}" />
      `;

    case 'spacer':
      return `
        <div style="${style}"></div>
      `;

    case 'bookingInfo':
      return renderBookingInfo(data, style);

    case 'services':
      return renderServices(data, style);

    default:
      return '';
  }
};

//  BOOKING INFO RENDERER 
const renderBookingInfo = (data, customStyle) => {
  const {
    branchName,
    branchAddress,
    barberName,
    date,
    time,
    duration,
    bookingRef
  } = data;

  const formattedDate = date ? new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'N/A';

  return `
    <div style="background: #f8f9fa; border-left: 4px solid #D4AF37; padding: 25px; margin: 25px 0; border-radius: 8px; ${customStyle}">
      <h2 style="font-size: 18px; margin-bottom: 20px; color: #000;">Your Appointment Details</h2>
      
      <div style="padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
        <strong style="color: #666;">Branch:</strong>
        <span style="color: #333; float: right;">${branchName || 'N/A'}</span>
        <div style="clear: both;"></div>
      </div>
      
      <div style="padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
        <strong style="color: #666;">Address:</strong>
        <span style="color: #333; float: right;">${branchAddress || 'N/A'}</span>
        <div style="clear: both;"></div>
      </div>
      
      <div style="padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
        <strong style="color: #666;">Your Barber:</strong>
        <span style="color: #333; float: right;">${barberName || 'N/A'}</span>
        <div style="clear: both;"></div>
      </div>
      
      <div style="padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
        <strong style="color: #666;">Date:</strong>
        <span style="color: #333; float: right;">${formattedDate}</span>
        <div style="clear: both;"></div>
      </div>
      
      <div style="padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
        <strong style="color: #666;">Time:</strong>
        <span style="color: #333; float: right;">${time || 'N/A'}</span>
        <div style="clear: both;"></div>
      </div>
      
      <div style="padding: 12px 0;">
        <strong style="color: #666;">Duration:</strong>
        <span style="color: #333; float: right;">${duration || 0} minutes</span>
        <div style="clear: both;"></div>
      </div>
      
      ${bookingRef ? `
        <div style="background: #fff; padding: 15px; margin-top: 15px; text-align: center; border-radius: 8px;">
          <p style="font-size: 12px; color: #666; margin-bottom: 8px;">BOOKING REFERENCE</p>
          <p style="font-size: 18px; font-weight: bold; color: #000; letter-spacing: 2px; font-family: 'Courier New', monospace;">${bookingRef}</p>
        </div>
      ` : ''}
    </div>
  `;
};

//  SERVICES RENDERER 
const renderServices = (data, customStyle) => {
  const { services = [], totalPrice } = data;

  if (services.length === 0) {
    return '';
  }

  const servicesHTML = services
    .map(service => `
      <div style="display: flex; justify-content: space-between; padding: 12px; background: #fafafa; margin-bottom: 8px; border-radius: 5px; border-bottom: 1px dotted #ddd;">
        <span style="color: #333;">${service.name}</span>
        <strong style="color: #D4AF37; font-weight: 600;">${service.price}</strong>
      </div>
    `)
    .join('');

  return `
    <div style="margin: 25px 0; ${customStyle}">
      <h3 style="font-size: 16px; margin-bottom: 15px; color: #000;">
        <svg style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 21C7.65685 21 9 19.6569 9 18C9 16.3431 7.65685 15 6 15C4.34315 15 3 16.3431 3 18C3 19.6569 4.34315 21 6 21ZM6 21L13.8586 13.1414M18 9C19.6569 9 21 7.65685 21 6C21 4.34315 19.6569 3 18 3C16.3431 3 15 4.34315 15 6C15 7.65685 16.3431 9 18 9ZM18 9L13.8586 13.1414M13.8586 13.1414L20.424 19.7065" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Services Booked
      </h3>
      ${servicesHTML}
      
      ${totalPrice !== undefined ? `
        <div style="background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); margin: 25px 0; padding: 25px; text-align: center; border-radius: 8px;">
          <div style="font-size: 14px; margin-bottom: 5px; color: #000; opacity: 0.8;">Total Amount</div>
          <div style="font-size: 36px; font-weight: 700; color: #000;">£${totalPrice.toFixed(2)}</div>
        </div>
      ` : ''}
    </div>
  `;
};

//  VARIABLE REPLACER 
const replaceVariables = (text, data) => {
  if (!text) return '';

  return text
    .replace(/{{customerName}}/g, data.customerName || '')
    .replace(/{{bookingRef}}/g, data.bookingRef || '')
    .replace(/{{date}}/g, data.date ? new Date(data.date).toLocaleDateString('en-GB') : '')
    .replace(/{{time}}/g, data.time || '')
    .replace(/{{branchName}}/g, data.branchName || '')
    .replace(/{{branchAddress}}/g, data.branchAddress || '')
    .replace(/{{barberName}}/g, data.barberName || '')
    .replace(/{{totalPrice}}/g, data.totalPrice ? `£${data.totalPrice.toFixed(2)}` : '')
    .replace(/{{duration}}/g, data.duration ? `${data.duration} minutes` : '')
    .replace(/{{hoursUntilAppointment}}/g, data.hoursUntilAppointment || '');
};

//  STYLE CONVERTER 
const styleToString = (styleObj) => {
  if (!styleObj || typeof styleObj !== 'object') return '';

  return Object.entries(styleObj)
    .map(([key, value]) => {
      // Convert camelCase to kebab-case
      const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${kebabKey}: ${value}`;
    })
    .join('; ');
};

//  EMAIL CONTAINER WRAPPER 
const wrapInEmailContainer = (contentHTML) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f4f4f4;
      color: #333;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <div class="email-container">
    ${contentHTML}
  </div>
</body>
</html>
  `;
};

//  FALLBACK EMAIL 
const generateFallbackEmail = (type, data) => {
  console.log('📧 Using fallback email template');

  const subject = type === 'booking' 
    ? 'Booking Confirmation' 
    : type === 'reminder' 
    ? 'Appointment Reminder' 
    : 'Appointment Notification';

  const html = `
    <div style="padding: 30px; background: #D4AF37; color: #000; text-align: center;">
      <h1>${subject}</h1>
    </div>
    <div style="padding: 30px;">
      <p>Dear ${data.customerName || 'Customer'},</p>
      <p style="margin-top: 20px;">This is a notification about your appointment.</p>
      ${data.bookingRef ? `<p style="margin-top: 20px;">Reference: ${data.bookingRef}</p>` : ''}
    </div>
  `;

  return {
    html: wrapInEmailContainer(html),
    subject
  };
};

/*
 * DOCUMENTATION:
 * 
 * PURPOSE:
 * - Convert template components into final HTML email
 * - Replace dynamic variables with actual data
 * - Provide fallback if template not found
 * 
 * MAIN FUNCTION:
 * renderEmailFromTemplate(type, data)
 * 
 * PARAMETERS:
 * - type: 'booking' | 'reminder' | 'cancellation' | 'rescheduled'
 * - data: Object containing appointment details
 * 
 * RETURNS:
 * {
 *   html: '<div>...</div>',  // Full HTML email
 *   subject: 'Email Subject'
 * }
 * 
 * USAGE IN EMAIL SERVICE:
 * 
 * import { renderEmailFromTemplate } from '../utils/emailRenderer.js';
 * 
 * const { html, subject } = await renderEmailFromTemplate('booking', {
 *   customerName: 'Ahmed',
 *   bookingRef: '123ABC',
 *   branchName: 'Main Branch',
 *   date: new Date(),
 *   time: '14:00',
 *   services: [{ name: 'Haircut', price: '£20' }],
 *   totalPrice: 20
 * });
 * 
 * await transporter.sendMail({
 *   to: 'customer@email.com',
 *   subject,
 *   html
 * });
 */

export default renderEmailFromTemplate;