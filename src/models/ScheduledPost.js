// models/ScheduledPost.js
import mongoose from 'mongoose';

const scheduledPostSchema = new mongoose.Schema({
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
  imageFiles: [{
    filename: String,
    path: String,
    mimetype: String,
    size: Number
  }],
  scheduleTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'posted', 'cancelled', 'failed'],
    default: 'scheduled'
  },
  linkedinPostId: {
    type: String,
    default: null
  },
  jobName: {
    type: String,
    unique: true,
    required: true
  },
  error: {
    type: String,
    default: null
  },
  postedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

export default mongoose.model('ScheduledPost', scheduledPostSchema);
