export async function getUser(id: number|string, gateway = window.location.origin) {
  const r = await fetch(`${gateway}/api/user/${id}`);
  return r.json();
}

export async function updateMe(token: string, data: { display_name?: string, bio?: string }, gateway = window.location.origin) {
  const r = await fetch(`${gateway}/api/user/me`, {
    method: "PUT",
    headers: { "Content-Type":"application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(data)
  });
  return r.json();
}
