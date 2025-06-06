// routes/linkedin.routes.js
import express from 'express';
import {
  redirectToLinkedIn,
  handleCallback,
  postContent,
  postContentWithFilesUGC,
  cancelScheduledPost,
  reschedulePost,
  getScheduledPosts,
  deleteLinkedInPost,
  getLinkedInAnalytics,
} from '../controllers/linkedin.controller.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = express.Router();

// Auth routes
router.get("/auth/linkedin", redirectToLinkedIn);
router.get("/auth/linkedin/callback", handleCallback);

// Post routes
router.post("/post", postContent);
router.post("/post-with-files", upload.array('images', 10), postContentWithFilesUGC);

// Scheduled posts management
router.get("/scheduled-posts", getScheduledPosts);
router.delete("/scheduled-posts/:scheduledPostId", cancelScheduledPost);
router.put("/scheduled-posts/:scheduledPostId/reschedule", reschedulePost);

// Delete posts
router.delete("/posts/:postId", deleteLinkedInPost);

// Analytics route
router.get("/analytics/:orgId", getLinkedInAnalytics);


export default router;
