import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
  name: String,
  linkedinClientId: String,
  linkedinClientSecret: String,
  linkedinRedirectUri: String,
  accessToken:  { type: String, default: null },
  memberId:  { type: String, default: null },
  organizationId: String, // Add this for company page posting
  // userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // If you have user model
});

const Organization = mongoose.model('Organization', organizationSchema);

export default Organization;
