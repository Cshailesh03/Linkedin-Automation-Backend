// linkedin.controller.js - Update imports at the top
import Organization from '../models/Organization.js';
import ScheduledPost from '../models/ScheduledPost.js';
import * as linkedinService from '../services/linkedin.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import schedule from 'node-schedule';
import { format } from 'date-fns-tz';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
// Import scheduledJobs from scheduler utility
import { scheduledJobs } from '../utils/scheduler.js';;
import { PostgetAnalytics } from '../services/linkedin.service.js';
import PostedContent from '../models/PostedContent.js';

// Redirect to LinkedIn auth
export const redirectToLinkedIn = asyncHandler(async (req, res) => {
  const { orgId } = req.query;

  const org = await Organization.findById(orgId);
  if (!org) throw new ApiError(404, "Organization not found");

  const state = orgId;
  const scope = 'openid profile email w_member_social';

  const authURL = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${org.linkedinClientId}&redirect_uri=${encodeURIComponent(org.linkedinRedirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

  res.redirect(authURL);
});

// Handle LinkedIn OAuth callback
export const handleCallback = asyncHandler(async (req, res) => {
  const { code, state: orgId } = req.query;
  // console.log(code);
  
  const org = await Organization.findById(orgId);
  // console.log(org);
  
  if (!org) throw new ApiError(400, "Invalid organization or state parameter");

  const { accessToken, memberId } = await linkedinService.exchangeCodeForToken(org, code);

  org.accessToken = accessToken;
  org.memberId = memberId;
  await org.save();

  // res.status(200).json(new ApiResponse(200, null, "✅ LinkedIn connected successfully"));
  res.redirect(`http://localhost:3000/linkedin-connected?orgId=${org._id}`);
});

// Post content to LinkedIn with multiple images support

export const postContent = asyncHandler(async (req, res) => {
  const { orgId, message, imageUrls, postAsOrganization, useUGCApi, scheduleTime } = req.body;

  if (!orgId || !message) {
    throw new ApiError(400, "orgId and message are required");
  }

  const org = await Organization.findById(orgId);
  if (!org?.accessToken) {
    throw new ApiError(403, "LinkedIn not connected for this organization");
  }


  const postJob = async () => {
    let result;

    try {
      // if (useUGCApi) {
      //   result = await linkedinService.postToLinkedInUGC(org, message, imageUrls);
      // } 
       if (postAsOrganization && org.organizationId) {
        result = await linkedinService.postToLinkedInAsOrganization(org, message, imageUrls);
      } 
      else {
        try {
            console.log("org;--//" ,org);

          result = await linkedinService.postToLinkedInUGC(org, message, imageUrls);
        } catch (error) {``
          console.log('New API failed, trying UGC API...');
          result = await linkedinService.postToLinkedInUGC(org, message, imageUrls);
        }
      }

      console.log('✅ Content posted to LinkedIn:', result);
    } catch (error) {
      console.error('❌ Failed to post content to LinkedIn:', error.message);
    }
  };

  // If a scheduleTime is provided, schedule the job
  if (scheduleTime) {
    const scheduleDate = new Date(scheduleTime);

    if (isNaN(scheduleDate.getTime())) {
      throw new ApiError(400, "Invalid scheduleTime format. Please provide a valid date string.");
    }

    schedule.scheduleJob(scheduleDate, postJob);

    console.log(`✅ Post scheduled for ${scheduleDate}`);
    res.status(200).json(new ApiResponse(200, null, `✅ Post scheduled for ${scheduleDate}`));
  } else {
    await postJob();
    res.status(200).json(new ApiResponse(200, null, "✅ Content posted to LinkedIn"));
  }
});

export const postContentWithFilesUGC = asyncHandler(async (req, res) => {
  const { orgId, message, imageUrls, scheduleTime } = req.body;
  const imageFiles = req.files || [];

  if (!orgId || !message) {
    throw new ApiError(400, "orgId and message are required");
  }

  const org = await Organization.findById(orgId);
  if (!org?.accessToken) {
    throw new ApiError(403, "LinkedIn not connected for this organization");
  }

  console.log("org;--///" ,org);
  // Save uploaded files info for scheduled posts
  const savedFileInfo = [];
  if (imageFiles.length > 0 && scheduleTime) {
    for (const file of imageFiles) {
      const filename = `${uuidv4()}-${file.originalname}`;
      const filepath = path.join('uploads', 'scheduled', filename);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      
      // Save file
      await fs.writeFile(filepath, file.buffer);
      
      savedFileInfo.push({
        filename: filename,
        path: filepath,
        mimetype: file.mimetype,
        size: file.size
      });
    }
  }

  const postJob = async (scheduledPostId = null) => {
    try {
      // Load files if this is a scheduled post
      let filesToPost = imageFiles;
      if (scheduledPostId) {
        const scheduledPost = await ScheduledPost.findById(scheduledPostId);
        if (scheduledPost.imageFiles && scheduledPost.imageFiles.length > 0) {
          filesToPost = [];
          for (const fileInfo of scheduledPost.imageFiles) {
            const buffer = await fs.readFile(fileInfo.path);
            filesToPost.push({
              buffer,
              mimetype: fileInfo.mimetype,
              originalname: fileInfo.filename
            });
          }
        }
      }

      const result = await linkedinService.postToLinkedInWithFilesUGC(
        org, 
        message, 
        imageUrls, 
        filesToPost
      );
      
      console.log("✅ Content posted to LinkedIn", result);
      
      // Save to PostedContent collection for immediate posts
      if (!scheduledPostId) {
        await PostedContent.create({
          orgId: org._id,
          message,
          imageUrls,
          mediaFiles: filesToPost.map(file => ({
            filename: file.originalname,
            mimetype: file.mimetype
          })),
          linkedinPostId: result.id,
          postedAt: new Date()
        });
      }
      
      // Update scheduled post status if applicable
      if (scheduledPostId) {
        await ScheduledPost.findByIdAndUpdate(scheduledPostId, {
          status: 'posted',
          linkedinPostId: result.id,
          postedAt: new Date()
        });
        
        // Clean up saved files
        const scheduledPost = await ScheduledPost.findById(scheduledPostId);
        if (scheduledPost.imageFiles) {
          for (const fileInfo of scheduledPost.imageFiles) {
            try {
              await fs.unlink(fileInfo.path);
            } catch (err) {
              console.error('Error deleting file:', err);
            }
          }
        }
      }
      
      return result;
    } catch (error) {
      console.error("❌ Error in scheduled post:", error);
      
      // Update scheduled post status if applicable
      if (scheduledPostId) {
        await ScheduledPost.findByIdAndUpdate(scheduledPostId, {
          status: 'failed',
          error: error.message
        });
      }
      
      throw error;
    }
  };

  if (scheduleTime) {
    const scheduleDate = new Date(scheduleTime);

    if (isNaN(scheduleDate.getTime())) {
      throw new ApiError(400, "Invalid scheduleTime format. Please provide a valid date string.");
    }

    if (scheduleDate <= new Date()) {
      throw new ApiError(400, "Schedule time must be in the future");
    }

    // Create scheduled post record
    const jobName = `linkedin-post-${uuidv4()}`;
    const scheduledPost = await ScheduledPost.create({
      orgId,
      message,
      imageUrls,
      imageFiles: savedFileInfo,
      scheduleTime: scheduleDate,
      jobName
    });

    // Schedule the job
    const job = schedule.scheduleJob(jobName, scheduleDate, async () => {
      await postJob(scheduledPost._id);
      scheduledJobs.delete(jobName);
    });

    // Store job reference
    scheduledJobs.set(jobName, job);

    const displayTime = format(scheduleDate, "yyyy-MM-dd'T'HH:mm:ss'Z'", { 
      timeZone: 'UTC' 
    });
    
    console.log(`✅ Post scheduled for ${displayTime}`);
    
    return res.status(200).json(
      new ApiResponse(200, { 
        scheduledPostId: scheduledPost._id,
        jobName: scheduledPost.jobName,
        scheduledTime: displayTime,
        scheduledTimeISO: scheduleDate.toISOString()
      }, `✅ Post scheduled for ${displayTime}`)
    );
  } else {
    const result = await postJob();
    return res.status(200).json(
      new ApiResponse(200, result, "✅ Content posted to LinkedIn")
    );
  }
});

// Cancel scheduled post
export const cancelScheduledPost = asyncHandler(async (req, res) => {
  const { scheduledPostId } = req.params;

  const scheduledPost = await ScheduledPost.findById(scheduledPostId);
  if (!scheduledPost) {
    throw new ApiError(404, "Scheduled post not found");
  }

  if (scheduledPost.status !== 'scheduled') {
    throw new ApiError(400, `Cannot cancel post with status: ${scheduledPost.status}`);
  }

  // Cancel the job
  const job = scheduledJobs.get(scheduledPost.jobName);
  if (job) {
    job.cancel();
    scheduledJobs.delete(scheduledPost.jobName);
  }

  // Update status
  scheduledPost.status = 'cancelled';
  await scheduledPost.save();

  // Clean up saved files
  if (scheduledPost.imageFiles) {
    for (const fileInfo of scheduledPost.imageFiles) {
      try {
        await fs.unlink(fileInfo.path);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    }
  }

  return res.status(200).json(
    new ApiResponse(200, scheduledPost, "✅ Scheduled post cancelled successfully")
  );
});

// Reschedule post
export const reschedulePost = asyncHandler(async (req, res) => {
  const { scheduledPostId } = req.params;
  const { newScheduleTime } = req.body;

  if (!newScheduleTime) {
    throw new ApiError(400, "newScheduleTime is required");
  }

  const scheduledPost = await ScheduledPost.findById(scheduledPostId);
  if (!scheduledPost) {
    throw new ApiError(404, "Scheduled post not found");
  }

  if (scheduledPost.status !== 'scheduled') {
    throw new ApiError(400, `Cannot reschedule post with status: ${scheduledPost.status}`);
  }

  const newScheduleDate = new Date(newScheduleTime);
  if (isNaN(newScheduleDate.getTime())) {
    throw new ApiError(400, "Invalid newScheduleTime format");
  }

  if (newScheduleDate <= new Date()) {
    throw new ApiError(400, "New schedule time must be in the future");
  }

  // Cancel existing job
  const existingJob = scheduledJobs.get(scheduledPost.jobName);
  if (existingJob) {
    existingJob.cancel();
  }

  // Schedule new job
  const job = schedule.scheduleJob(scheduledPost.jobName, newScheduleDate, async () => {
    const org = await Organization.findById(scheduledPost.orgId);
    
    // Load files
    let filesToPost = [];
    if (scheduledPost.imageFiles && scheduledPost.imageFiles.length > 0) {
      for (const fileInfo of scheduledPost.imageFiles) {
        const buffer = await fs.readFile(fileInfo.path);
        filesToPost.push({
          buffer,
          mimetype: fileInfo.mimetype,
          originalname: fileInfo.filename
        });
      }
    }

    await postJob(scheduledPost._id);
    scheduledJobs.delete(scheduledPost.jobName);
  });

  scheduledJobs.set(scheduledPost.jobName, job);

  // Update scheduled post
  scheduledPost.scheduleTime = newScheduleDate;
  await scheduledPost.save();

  const displayTime = format(newScheduleDate, "yyyy-MM-dd'T'HH:mm:ss'Z'", { 
    timeZone: 'UTC' 
  });

  return res.status(200).json(
    new ApiResponse(200, {
      scheduledPost,
      newScheduledTime: displayTime,
      newScheduledTimeISO: newScheduleDate.toISOString()
    }, `✅ Post rescheduled for ${displayTime}`)
  );
});

// Get all scheduled posts
export const getScheduledPosts = asyncHandler(async (req, res) => {
  const { orgId } = req.query;
  const { status } = req.query;

  const query = {};
  if (orgId) query.orgId = orgId;
  if (status) query.status = status;

  const scheduledPosts = await ScheduledPost.find(query)
    .populate('orgId', 'name')
    .sort({ scheduleTime: 1 });

  return res.status(200).json(
    new ApiResponse(200, scheduledPosts, "✅ Scheduled posts retrieved successfully")
  );
});

// Delete posted content from LinkedIn
export const deleteLinkedInPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { orgId } = req.body;

  if (!orgId || !postId) {
    throw new ApiError(400, "orgId and postId are required");
  }

  const org = await Organization.findById(orgId);
  if (!org?.accessToken) {
    throw new ApiError(403, "LinkedIn not connected for this organization");
  }

  try {
    console.log('🗑️ Attempting to delete post:', postId);
    console.log('🏢 Organization:', org.name);
    
    // Try to delete from LinkedIn
    const deleteResult = await linkedinService.deleteLinkedInPost(org.accessToken, postId);

    // Update our database records
    const updatedPost = await ScheduledPost.findOneAndUpdate(
      { linkedinPostId: postId },
      { 
        status: 'deleted',
        deletedAt: new Date(),
        deleteMethod: deleteResult.method
      },
      { new: true }
    );

    // Also try to find by numeric ID if the full URN didn't match
    if (!updatedPost && postId.includes('urn:li:share:')) {
      const numericId = postId.replace('urn:li:share:', '');
      await ScheduledPost.findOneAndUpdate(
        { linkedinPostId: numericId },
        { 
          status: 'deleted',
          deletedAt: new Date(),
          deleteMethod: deleteResult.method
        }
      );
    }

    return res.status(200).json(
      new ApiResponse(200, { 
        deletedPostId: postId,
        method: deleteResult.method,
        alreadyDeleted: deleteResult.alreadyDeleted || false,
        updatedRecord: updatedPost ? true : false 
      }, deleteResult.alreadyDeleted ? 
        "✅ Post was already deleted from LinkedIn" : 
        "✅ Post deleted from LinkedIn successfully")
    );
    
  } catch (error) {
    console.error('❌ Failed to delete LinkedIn post:', error);
    
    // If it's a 404 or already deleted, still update our database
    if (error.statusCode === 404 || error.message.includes('already been deleted')) {
      await ScheduledPost.findOneAndUpdate(
        { linkedinPostId: postId },
        { 
          status: 'deleted',
          deletedAt: new Date(),
          error: 'Post already deleted from LinkedIn'
        }
      );
      
      return res.status(200).json(
        new ApiResponse(200, { deletedPostId: postId }, "✅ Post was already deleted from LinkedIn")
      );
    }
    
    throw error;
  }
});


/**
 * GET /linkedin/analytics/:orgId
 * Fetches analytics for an organization's LinkedIn activity
 */
export const getLinkedInAnalytics = asyncHandler(async (req, res) => {
  const { orgId } = req.params;

  if (!orgId || typeof orgId !== 'string') {
    throw new ApiError(400, "Valid Organization ID is required");
  }

  let analytics;
  try {
    analytics = await PostgetAnalytics(orgId);
  } catch (error) {
    console.error("❌ Error fetching LinkedIn analytics:", error.message);
    throw new ApiError(500, "Failed to fetch LinkedIn analytics");
  }

  return res.status(200).json(
    new ApiResponse(200, analytics, "✅ LinkedIn analytics fetched successfully")
  );
});


