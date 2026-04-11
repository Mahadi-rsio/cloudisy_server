fetch("http://localhost:3000/create_page", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    body: JSON.stringify({
        project_name: "hello",
        plan: "free",
        tenant_name: "mahade",
    }),
})
    .then(res => res.json())
    .then(data => console.log(data))
    .catch(err => console.error(err));
