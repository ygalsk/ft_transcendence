export async function getUser(id: number|string, gateway = window.location.origin) {
  const r = await fetch(`${gateway}/api/user/${id}`);
  return r.json();
}

export async function updateMe(token: string, data: { display_name?: string, bio?: string }, gateway = window.location.origin) {
  // Filter out empty/undefined values to only send fields that should be updated
  const updates: { display_name?: string, bio?: string } = {};
  
  if (data.display_name && data.display_name.trim()) {
    updates.display_name = data.display_name.trim();
  }
  if (data.bio && data.bio.trim()) {
    updates.bio = data.bio.trim();
  }

  // Ensure at least one field is being updated
  if (Object.keys(updates).length === 0) {
    throw new Error("At least one field (display_name or bio) must be provided");
  }

  const r = await fetch(`${gateway}/api/user/me`, {
    method: "PUT",
    headers: { "Content-Type":"application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(updates)
  });
  
  if (!r.ok) {
    const error = await r.json();
    throw new Error(error.message || 'Update failed');
  }
  
  return r.json();
}
