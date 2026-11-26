import { Schema, model, type InferSchemaType } from 'mongoose';
import { CATEGORY_GROUPS } from '@aia/shared';
import { toJSONPlugin } from './plugins.js';

const questionCategorySchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case'],
    },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    group: { type: String, enum: CATEGORY_GROUPS, required: true },
    description: { type: String, trim: true, maxlength: 300 },
    icon: { type: String, trim: true, maxlength: 40 }, // lucide icon name
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    questionCount: { type: Number, default: 0, min: 0 }, // denormalised counter
  },
  { timestamps: true, collection: 'question_categories' },
);

questionCategorySchema.index({ slug: 1 }, { unique: true });
questionCategorySchema.index({ group: 1, order: 1 });
questionCategorySchema.plugin(toJSONPlugin);

export type QuestionCategory = InferSchemaType<typeof questionCategorySchema>;
export const QuestionCategoryModel = model('QuestionCategory', questionCategorySchema);
