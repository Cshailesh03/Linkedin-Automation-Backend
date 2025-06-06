import axios from 'axios';
import qs from 'qs';
import {ApiError} from '../utils/ApiError.js';
import PostedContent from '../models/PostedContent.js';
import ScheduledPost from '../models/ScheduledPost.js';

export const exchangeCodeForToken = async (org, code) => {
  try {
    const tokenRes = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: org.linkedinRedirectUri,
        client_id: org.linkedinClientId,
        client_secret: org.linkedinClientSecret,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    // console.log(tokenRes);
    

    const accessToken = tokenRes.data.access_token;
    // console.log(accessToken);
    
    const userInfoRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return { accessToken, memberId: userInfoRes.data.sub };
  } catch (error) {
    console.error('Error exchanging code for token:', error.response?.data || error.message);
    throw new ApiError(500, 'Failed to exchange authorization code for token');
  }
};

export const uploadImageToLinkedIn = async (accessToken, authorUrn, imageUrl) => {
  try {
    // Step 1: Initialize upload
    const initializeUploadRes = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: authorUrn,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }
          ]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    const uploadUrl = initializeUploadRes.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = initializeUploadRes.data.value.asset;

    // Step 2: Download image from URL
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data);

    // Step 3: Upload image binary to LinkedIn
    await axios.post(uploadUrl, imageBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    });

    return asset; // This is the media URN to use in the post
  } catch (error) {
    console.error('Error uploading image to LinkedIn:', error.response?.data || error.message);
    throw new ApiError(500, 'Failed to upload image to LinkedIn');
  }
};

export const postToLinkedIn = async (org, message, imageUrls = []) => {
  try {
    const author = `urn:li:person:${org.memberId}`;
    
    // Build the post body
    const postBody = {
      author: author,
      commentary: message,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    };

    // Upload images to LinkedIn first if provided
    if (imageUrls && imageUrls.length > 0) {
      console.log('Uploading images to LinkedIn...');
      const mediaAssets = [];
      
      for (const imageUrl of imageUrls) {
        try {
          const mediaUrn = await uploadImageToLinkedIn(org.accessToken, author, imageUrl);
          mediaAssets.push(mediaUrn);
        } catch (error) {
          console.error(`Failed to upload image ${imageUrl}:`, error.message);
        }
      }

      if (mediaAssets.length > 0) {
        // Correct media structure for LinkedIn API
        postBody.content = {
          media: mediaAssets.map(asset => ({
            id: asset  // Use 'id' instead of 'media'
          }))
        };
      }
    }

    console.log('Posting to LinkedIn with body:', JSON.stringify(postBody, null, 2));

    const response = await axios.post(
      'https://api.linkedin.com/v2/posts',
      postBody,
      {
        headers: {
          'Authorization': `Bearer ${org.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202401'
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error posting to LinkedIn:', error.response?.data || error.message);
    throw new ApiError(500, 'Failed to post content to LinkedIn');
  }
};

// Alternative approach using UGC Posts API (if the above doesn't work)
export const postToLinkedInUGC = async (org, message, imageUrls = []) => {
  try {
        console.log('rog;;---',org)

    console.log(`org.memberId:-${org.memberId}`);

    const author = `urn:li:person:${org.memberId}`;
    
    // Build the post body for UGC API
    const postBody = {
      author: author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: message
          },
          shareMediaCategory: "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
      }
    };

    // Upload images if provided
    if (imageUrls && imageUrls.length > 0) {
      console.log('Uploading images to LinkedIn...');
      const mediaAssets = [];
      
      for (const imageUrl of imageUrls) {
        try {
          const mediaUrn = await uploadImageToLinkedIn(org.accessToken, author, imageUrl);
          mediaAssets.push({
            status: "READY",
            description: {
              text: "Image"
            },
            media: mediaUrn,
            title: {
              text: "Image"
            }
          });
        } catch (error) {
          console.error(`Failed to upload image ${imageUrl}:`, error.message);
        }
      }

      if (mediaAssets.length > 0) {
        postBody.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "IMAGE";
        postBody.specificContent["com.linkedin.ugc.ShareContent"].media = mediaAssets;
      }
    }

    console.log('Posting to LinkedIn UGC with body:', JSON.stringify(postBody, null, 2));

    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      postBody,
      {
        headers: {
          'Authorization': `Bearer ${org.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error posting to LinkedIn UGC:', error.response?.data || error.message);
    throw new ApiError(500, 'Failed to post content to LinkedIn');
  }
};

// Function to post as organization (company page)
export const postToLinkedInAsOrganization = async (org, message, imageUrls = []) => {
  try {
    const orgUrn = `urn:li:organization:${org.organizationId}`;
    
    const postBody = {
      author: orgUrn,
      commentary: message,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    };

    // Upload images to LinkedIn first if provided
    if (imageUrls && imageUrls.length > 0) {
      console.log('Uploading images to LinkedIn for organization...');
      const mediaAssets = [];
      
      for (const imageUrl of imageUrls) {
        try {
          const mediaUrn = await uploadImageToLinkedIn(org.accessToken, orgUrn, imageUrl);
          mediaAssets.push(mediaUrn);
        } catch (error) {
          console.error(`Failed to upload image ${imageUrl}:`, error.message);
        }
      }

      if (mediaAssets.length > 0) {
        postBody.content = {
          media: mediaAssets.map(asset => ({
            id: asset  // Use 'id' instead of 'media'
          }))
        };
      }
    }

    const response = await axios.post(
      'https://api.linkedin.com/v2/posts',
      postBody,
      {
        headers: {
          'Authorization': `Bearer ${org.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202401'
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error posting to LinkedIn as organization:', error.response?.data || error.message);
    throw new ApiError(500, 'Failed to post content to LinkedIn as organization');
  }
};

// Add this new function to linkedin.service.js
export const uploadImageBufferToLinkedIn = async (accessToken, authorUrn, imageBuffer, mimeType) => {
  try {
    // Step 1: Register the upload
    const initializeUploadRes = await axios.post(
      "https://api.linkedin.com/v2/assets?action=registerUpload",
      {
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: authorUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    const uploadUrl = initializeUploadRes.data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
    const asset = initializeUploadRes.data.value.asset;

    // Step 2: Upload the image buffer
    await axios.post(uploadUrl, imageBuffer, {
      headers: {
        "Content-Type": mimeType,
      },
    });

    return asset; // Return the media URN
  } catch (error) {
    console.error("Error uploading image buffer to LinkedIn:", error.response?.data || error.message);
    throw new ApiError(500, "Failed to upload image to LinkedIn");
  }
};

// Update the postToLinkedIn function to handle both URLs and file buffers
export const postToLinkedInWithFilesUGC = async (org, message, imageUrls = [], imageFiles = []) => {
  try {
    console.log('org---',org);
    
    console.log(`org.memberId:-${org.memberId}`);
    
    const author = `urn:li:person:${org.memberId}`; // Author URN for the authenticated user

    // Build the base post body for UGC API
    const postBody = {
      author: author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: message, // The message content of the post
          },
          shareMediaCategory: "NONE", // Default to no media
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC", // Post visibility
      },
    };

    const mediaAssets = [];

    // **Step 1: Upload Local Files to LinkedIn**
    if (imageFiles && imageFiles.length > 0) {
      console.log("Uploading local images to LinkedIn...");
      for (const file of imageFiles) {
        try {
          const mediaUrn = await uploadImageBufferToLinkedIn(
            org.accessToken,
            author,
            file.buffer,
            file.mimetype
          );
          mediaAssets.push({
            status: "READY",
            description: {
              text: "Uploaded image",
            },
            media: mediaUrn,
            title: {
              text: file.originalname || "Image",
            },
          });
        } catch (error) {
          console.error(`Failed to upload image file ${file.originalname}:`, error.message);
        }
      }
    }

    // **Step 2: Upload Images from URLs**
    if (imageUrls && imageUrls.length > 0) {
      console.log("Uploading images from URLs to LinkedIn...");
      for (const imageUrl of imageUrls) {
        try {
          const mediaUrn = await uploadImageToLinkedIn(org.accessToken, author, imageUrl);
          mediaAssets.push({
            status: "READY",
            description: {
              text: "Uploaded image",
            },
            media: mediaUrn,
            title: {
              text: "Image",
            },
          });
        } catch (error) {
          console.error(`Failed to upload image URL ${imageUrl}:`, error.message);
        }
      }
    }

    // **Step 3: Add Media to Post Body**
    if (mediaAssets.length > 0) {
      postBody.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "IMAGE";
      postBody.specificContent["com.linkedin.ugc.ShareContent"].media = mediaAssets;
    }

    console.log("Posting to LinkedIn UGC with body:", JSON.stringify(postBody, null, 2));

    // **Step 4: Post Content to LinkedIn**
    const response = await axios.post(
      "https://api.linkedin.com/v2/ugcPosts",
      postBody,
      {
        headers: {
          Authorization: `Bearer ${org.accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    return response.data; // Return the LinkedIn response
  } catch (error) {
    console.error("Error posting to LinkedIn UGC:", error.response?.data || error.message);
    throw new ApiError(500, "Failed to post content to LinkedIn");
  }
};

// linkedin.service.js - Updated delete function
export const deleteLinkedInPost = async (accessToken, postId) => {
  try {
    // Format the post ID correctly - LinkedIn expects full URN format
    let formattedPostId = postId;
    
    // If postId is just numeric, convert to full URN format
    if (/^\d+$/.test(postId)) {
      formattedPostId = `urn:li:share:${postId}`;
    }
    
    // Remove LinkedIn-Version header as it's causing 426 error
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json'
    };

    // Use v2 API endpoint instead of REST endpoint
    const url = `https://api.linkedin.com/v2/shares/${encodeURIComponent(formattedPostId)}`;
    
    console.log('🗑️ Attempting to delete LinkedIn post:', formattedPostId);
    console.log('🔗 Delete URL:', url);
    
    const response = await axios.delete(url, { headers });
    
    console.log('✅ Post deleted successfully from LinkedIn');
    return response.data;
    
  } catch (error) {
    console.error('❌ Error deleting LinkedIn post:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      postId: postId
    });
    
    // Handle specific LinkedIn API errors
    if (error.response?.status === 404) {
      throw new ApiError(404, 'Post not found on LinkedIn. It may have already been deleted.');
    } else if (error.response?.status === 403) {
      throw new ApiError(403, 'Insufficient permissions to delete this post. Check your LinkedIn app permissions.');
    } else if (error.response?.status === 401) {
      throw new ApiError(401, 'LinkedIn access token is invalid or expired.');
    } else if (error.response?.status === 426) {
      throw new ApiError(426, 'LinkedIn API version issue. Please contact support.');
    } else {
      throw new ApiError(500, `Failed to delete post from LinkedIn: ${error.response?.data?.message || error.message}`);
    }
  }
};

export const PostgetAnalytics = async (orgId) => {
  try {
    // Count scheduled posts
    const scheduledPostsCount = await ScheduledPost.countDocuments({
      orgId,
      status: 'scheduled'
    });

    // Define today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Count published posts today
    const publishedTodayCount = await PostedContent.countDocuments({
      orgId,
      status: 'posted',
      postedAt: { $gte: todayStart, $lte: todayEnd }
    });

    // Count failed posts
    const failedPostsCount = await PostedContent.countDocuments({
      orgId,
      status: 'failed'
    });

    return {
      scheduledPosts: scheduledPostsCount,
      publishedToday: publishedTodayCount,
      failedPosts: failedPostsCount
    };
  } catch (error) {
    console.error('Error fetching LinkedIn analytics:', error);
    throw new Error('Failed to fetch LinkedIn analytics');
  }
};



