// controllers/postController.js
import {asyncHandler} from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import ScheduledPost from '../models/ScheduledPost.js';
import PostedContent from '../models/PostedContent.js';


export const getAllPosts = asyncHandler(async (req, res) => {
  const { orgId } = req.params;

  if (!orgId) {
    throw new ApiError(400, "orgId is required");
  }

  // Fetch scheduled posts
  const scheduledPosts = await ScheduledPost.find({ orgId }).sort({ scheduleTime: -1 });

  // Fetch posted content (immediate + scheduled)
  const postedContents = await PostedContent.find({ orgId }).sort({ postedAt: -1 });

  return res.status(200).json(
    new ApiResponse(200, {
      scheduledPosts,
      postedContents
    }, "✅ Posts fetched successfully")
  );
});