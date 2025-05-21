// Feedback.js - A lightweight form validation and feedback library

/**
 * Feedback Class
 * Handles form validation and user feedback
 */
class Feedback {
    constructor(options = {}) {
      this.options = {
        errorClass: 'error',
        successClass: 'success',
        feedbackClass: 'feedback-message',
        validateOnBlur: true,
        scrollToError: true,
        ...options
      };
      
      this.validators = {
        required: (value) => value && value.trim() !== '',
        email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        minLength: (value, length) => value && value.length >= length,
        maxLength: (value, length) => value && value.length <= length,
        pattern: (value, pattern) => pattern.test(value),
        match: (value, field) => value === document.querySelector(field).value,
        number: (value) => !isNaN(parseFloat(value)) && isFinite(value),
        min: (value, min) => parseFloat(value) >= min,
        max: (value, max) => parseFloat(value) <= max,
        phone: (value) => /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/.test(value),
        url: (value) => /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(value),
        date: (value) => !isNaN(Date.parse(value))
      };
      
      this.messages = {
        required: 'This field is required',
        email: 'Please enter a valid email address',
        minLength: (length) => `This field must be at least ${length} characters`,
        maxLength: (length) => `This field cannot exceed ${length} characters`,
        pattern: 'Please match the requested format',
        match: 'Fields do not match',
        number: 'Please enter a valid number',
        min: (min) => `Value must be at least ${min}`,
        max: (max) => `Value cannot exceed ${max}`,
        phone: 'Please enter a valid phone number',
        url: 'Please enter a valid URL',
        date: 'Please enter a valid date'
      };
      
      this.init();
    }
    
    /**
     * Initialize the feedback system
     */
    init() {
      if (this.options.validateOnBlur) {
        document.addEventListener('blur', (event) => {
          if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') {
            if (event.target.dataset.validate) {
              this.validateField(event.target);
            }
          }
        }, true);
      }
      
      // Add form submit listeners
      document.addEventListener('submit', (event) => {
        const form = event.target;
        if (form.dataset.feedback === 'true') {
          if (!this.validateForm(form)) {
            event.preventDefault();
          }
        }
      });
    }
    
    /**
     * Validate a single field
     * @param {HTMLElement} field - The field to validate
     * @returns {boolean} - Whether the field is valid
     */
    validateField(field) {
      // Clear existing feedback
      this.clearFieldFeedback(field);
      
      let isValid = true;
      const rules = field.dataset.validate ? field.dataset.validate.split(' ') : [];
      
      for (const rule of rules) {
        // Handle parametrized rules like minLength:8
        const [ruleName, param] = rule.split(':');
        
        if (!this.validators[ruleName]) {
          console.warn(`Validator "${ruleName}" not found`);
          continue;
        }
        
        const isFieldValid = this.validators[ruleName](field.value, param);
        
        if (!isFieldValid) {
          isValid = false;
          let message = field.dataset[`msg${ruleName.charAt(0).toUpperCase() + ruleName.slice(1)}`] || 
                        (typeof this.messages[ruleName] === 'function' ? 
                         this.messages[ruleName](param) : 
                         this.messages[ruleName]);
                         
          this.showFieldError(field, message);
          break; // Stop on first error
        }
      }
      
      if (isValid && rules.length > 0) {
        this.showFieldSuccess(field);
      }
      
      return isValid;
    }
    
    /**
     * Validate an entire form
     * @param {HTMLFormElement} form - The form to validate
     * @returns {boolean} - Whether the form is valid
     */
    validateForm(form) {
      let isValid = true;
      const fields = form.querySelectorAll('[data-validate]');
      
      fields.forEach(field => {
        if (!this.validateField(field)) {
          isValid = false;
        }
      });
      
      if (!isValid && this.options.scrollToError) {
        const firstError = form.querySelector(`.${this.options.errorClass}`);
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      
      return isValid;
    }
    
    /**
     * Show an error message for a field
     * @param {HTMLElement} field - The field to show error for
     * @param {string} message - The error message
     */
    showFieldError(field, message) {
      field.classList.add(this.options.errorClass);
      
      const feedback = document.createElement('div');
      feedback.className = this.options.feedbackClass;
      feedback.textContent = message;
      feedback.style.color = 'red';
      
      field.parentNode.insertBefore(feedback, field.nextSibling);
    }
    
    /**
     * Show success styling for a field
     * @param {HTMLElement} field - The field to show success for
     */
    showFieldSuccess(field) {
      field.classList.add(this.options.successClass);
    }
    
    /**
     * Clear all feedback for a field
     * @param {HTMLElement} field - The field to clear feedback for
     */
    clearFieldFeedback(field) {
      field.classList.remove(this.options.errorClass, this.options.successClass);
      
      const feedbackElements = field.parentNode.querySelectorAll(`.${this.options.feedbackClass}`);
      feedbackElements.forEach(element => element.remove());
    }
    
    /**
     * Clear all feedback from a form
     * @param {HTMLFormElement} form - The form to clear feedback from
     */
    clearFormFeedback(form) {
      const fields = form.querySelectorAll(`.${this.options.errorClass}, .${this.options.successClass}`);
      fields.forEach(field => {
        this.clearFieldFeedback(field);
      });
    }
    
    /**
     * Add a custom validator
     * @param {string} name - The name of the validator
     * @param {Function} validator - The validator function
     * @param {string|Function} message - The error message or function returning a message
     */
    addValidator(name, validator, message) {
      this.validators[name] = validator;
      this.messages[name] = message;
    }
    
    /**
     * Set custom messages for validators
     * @param {Object} messages - Object of message overrides
     */
    setMessages(messages) {
      this.messages = { ...this.messages, ...messages };
    }
  }
  
  // Export the Feedback class
  export default Feedback;