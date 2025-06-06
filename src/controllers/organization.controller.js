// controllers/organization.controller.js
import Organization from "../models/Organization.js";
import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import axios from "axios";
import qs from "querystring";

// Create a new organization
export const createOrganization = asyncHandler(async (req, res) => {
  const { name, linkedinClientId, linkedinClientSecret, linkedinRedirectUri } = req.body;

  if (!name || !linkedinClientId || !linkedinClientSecret || !linkedinRedirectUri) {
    throw new ApiError(400, "All fields are required");
  }

  const newOrg = await Organization.create({
    name,
    linkedinClientId,
    linkedinClientSecret,
    linkedinRedirectUri,
  });

  res.status(201).json(new ApiResponse(201, newOrg, "Organization created successfully"));
});

// Get all organizations
export const getAllOrganizations = asyncHandler(async (req, res) => {
  const orgs = await Organization.find();
  res.status(200).json(new ApiResponse(200, orgs, "Organizations fetched"));
});

// Get a specific organization by ID
export const getOrganizationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const org = await Organization.findById(id);

  if (!org) {
    throw new ApiError(404, "Organization not found");
  }

  res.status(200).json(new ApiResponse(200, org, "Organization found"));
});

// Delete an organization by ID
export const deleteOrganization = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const org = await Organization.findById(id);
  if (!org) {
    throw new ApiError(404, "Organization not found");
  }

  await Organization.findByIdAndDelete(id);

  res.status(200).json(new ApiResponse(200, null, "Organization deleted successfully"));
});
// controllers/organization.controller.js

// Controller for disconnecting LinkedIn
export const disconnectLinkedIn = asyncHandler(async (req, res) => {
  const { orgId } = req.params;

  // Find organization by ID
  const org = await Organization.findById(orgId);
  if (!org) {
    throw new ApiError(404, "Organization not found");
  }

  // If already disconnected
  if (!org.accessToken && !org.memberId) {
    return res.status(200).json(new ApiResponse(200, null, "Already disconnected"));
  }

  // Optionally revoke token on LinkedIn side
  if (org.accessToken) {
    try {
      await revokeLinkedInToken(org.accessToken, org.linkedinClientId, org.linkedinClientSecret);
    } catch (error) {
      console.error("Failed to revoke LinkedIn token:", error.message);
      // You can choose to continue anyway and just clear tokens locally
    }
  }

  // Clear stored tokens
  org.accessToken = undefined;
  org.memberId = undefined;
  await org.save();

  return res.status(200).json(new ApiResponse(200, null, "✅ LinkedIn disconnected successfully"));
});

// Helper: Revoke LinkedIn access token
async function revokeLinkedInToken(accessToken, clientId, clientSecret) {
  try {
    const response = await axios.post(
      "https://www.linkedin.com/oauth/v2/revoke", 
      new URLSearchParams({
        token: accessToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("LinkedIn token revoked successfully", response.data);
  } catch (error) {
    console.error("Error revoking LinkedIn token:", error.response?.data || error.message);
    throw error;
  }
}