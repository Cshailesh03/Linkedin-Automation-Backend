// models/PostedContent.js
import mongoose from 'mongoose';

const PostedContentSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    message: {
      type: String,
      required: true
    },
    imageUrls: [{
      type: String
    }],
    mediaFiles: [{
      filename: String,
      path: String, // Only used if files were saved locally
      mimetype: String,
      size: Number
    }],
    postedAt: {
      type: Date,
      default: Date.now
    },
    linkedinPostId: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['posted', 'failed'],
      default: 'posted'
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('PostedContent', PostedContentSchema);