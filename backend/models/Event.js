const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Please add a description'],
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'Please add a type'],
      trim: true,
    },
    non_iiit_eligibility: {
      type: Boolean, // true if non-IIIT + IIIT participants are eligible, false if only IIIT participants are eligible
      required: [true, 'Please specify if the participant is eligible'],
      default: false,
    },
    registration_deadline: {
      type: Date,
      required: true,
    },
    event_start_date: {
      type: Date,
      required: true,
    },
    event_end_date: {
      type: Date,
      required: true, 
    },
    registration_limit: {
      type: Number
    },
    registration_fee: {
      type: Number,
      default: 0,
    },
    organizer_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    event_tags: {
        type: [String]
    }
    ,
    // Custom registration form fields
    formFields: {
      type: [
        new mongoose.Schema(
          {
            position: { type: Number, required: true },
            type: {
              type: String,
              required: true,
              enum: ['text', 'number', 'dropdown', 'checkbox', 'radio', 'file'],
            },
            name: { type: String, required: true },
            title: { type: String, required: true },
            choices: { type: [String], default: undefined },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },

    // once true, formFields cannot be modified
    form_locked: {
      type: Boolean,
      default: false,
    },

    // Merchandise items (only for events of type 'merchandise')
    merchandise: {
      type: [
        new mongoose.Schema(
          {
            itemName: { type: String, required: true },
            sizes: { type: [String], default: undefined },
            colors: { type: [String], default: undefined },
            variants: { type: [String], default: undefined },
            stockQuantity: { type: Number, default: 0, min: 0 },
            purchaseLimitPerParticipant: { type: Number, default: 1, min: 0 },
          }
        ),
      ],
      default: undefined,
    },

    // event lifecycle
    status: {
      type: String,
      enum: ['draft', 'published', 'ongoing', 'completed', 'closed'],
      default: 'draft',
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Validate formFields: name uniqueness within same event and choices presence for
// dropdown/checkbox/radio types. This validator runs on save and on create.
EventSchema.path('formFields').validate(function (formFields) {
  if (!formFields) return true; // nothing to validate

  // name uniqueness
  const names = formFields.map((f) => f.name);
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) {
    return false;
  }

  // choices requirement
  for (const f of formFields) {
    const needsChoices = ['dropdown', 'checkbox', 'radio'].includes(f.type);
    if (needsChoices) {
      if (!Array.isArray(f.choices) || f.choices.length === 0) return false;
    } else {
      if (Array.isArray(f.choices) && f.choices.length > 0) return false;
    }
  }

  return true;
}, 'Invalid formFields: name must be unique and choices are required for dropdown/checkbox/radio');

// Validate merchandise structure when present
EventSchema.path('merchandise').validate(function (merch) {
  if (!merch) return true;

  if (!Array.isArray(merch) || merch.length === 0) return false;

  for (const m of merch) {
    if (!m.itemName || typeof m.itemName !== 'string') return false;
    if (Array.isArray(m.sizes) && m.sizes.some(s => typeof s !== 'string')) return false;
    if (Array.isArray(m.colors) && m.colors.some(c => typeof c !== 'string')) return false;
    if (Array.isArray(m.variants) && m.variants.some(v => typeof v !== 'string')) return false;
    if (typeof m.stockQuantity !== 'number' || m.stockQuantity < 0) return false;
    if (typeof m.purchaseLimitPerParticipant !== 'number' || m.purchaseLimitPerParticipant < 0) return false;
  }

  return true;
}, 'Invalid merchandise: each item must have a name, valid options, non-negative stock and purchase limit');

// Prevent modifications to formFields when form_locked is true or status is published.
// This covers findOneAndUpdate flows (typical for API updates).
EventSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate();
    if (!update) return next();

    // check if formFields is being changed
    const isChangingForm =
      Object.prototype.hasOwnProperty.call(update, 'formFields') ||
      (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'formFields')) ||
      (update.$push && Object.prototype.hasOwnProperty.call(update.$push, 'formFields'));

    // check if merchandise is being changed
    const isChangingMerch =
      Object.prototype.hasOwnProperty.call(update, 'merchandise') ||
      (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'merchandise')) ||
      (update.$push && Object.prototype.hasOwnProperty.call(update.$push, 'merchandise'));

    if (!isChangingForm && !isChangingMerch) return next();

    // fetch current doc
    const docToUpdate = await this.model.findOne(this.getQuery());
    if (!docToUpdate) return next();

    // if the event is locked, disallow edits to either formFields or merchandise
    if (docToUpdate.form_locked) {
      return next(new Error('Event form is locked and cannot be modified'));
    }
    // prevent modifications when not in draft
    if (docToUpdate.status !== 'draft') {
      return next(new Error('Event not in draft state; form/merchandise cannot be modified'));
    }

    return next();
  } catch (err) {
    return next(err);
  }
});

// Also prevent direct save() changes if the doc is already locked/published and
// formFields changed.
EventSchema.pre('save', async function (next) {
  try {
    // if neither formFields nor merchandise changed, continue
    if (!this.isModified('formFields') && !this.isModified('merchandise')) return next();
    if (this.form_locked) return next(new Error('Event form is locked and cannot be modified'));
    if (this.isNew) return next();
    const existing = await this.constructor.findById(this._id).lean();
    if(existing && existing.status==='published') {
      return next(new Error('Published event cannot have its form or merchandise modified'));
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

// Ensure only appropriate fields exist depending on event.type
EventSchema.pre('validate', function (next) {
  try {
    // If normal event, allow formFields but disallow merchandise
    if (this.type === 'normal') {
      if (this.merchandise && Array.isArray(this.merchandise) && this.merchandise.length > 0) {
        return next(new Error('Normal events cannot have merchandise fields'));
      }
    } else if (this.type === 'merchandise') {
      // If merchandise event, require merchandise array and disallow formFields
      if (!this.merchandise || !Array.isArray(this.merchandise) || this.merchandise.length === 0) {
        // console.log("merchandise: ", this.merchandise);
        return next(new Error('Merchandise events must define merchandise items'));
      }
      if (this.formFields && Array.isArray(this.formFields) && this.formFields.length > 0) {
        return next(new Error('Merchandise events cannot have a registration form'));
      }
    } else {
      // other types: disallow formFields
      if (this.formFields && Array.isArray(this.formFields) && this.formFields.length > 0) {
        return next(new Error('Only normal events may have a registration form'));
      }
    }

    return next();
  } catch (err) {
    return next(err);
  }
});

module.exports = mongoose.model('Event', EventSchema);