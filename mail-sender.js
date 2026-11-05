'use strict';
// Hostinger validates the SMTP envelope sender against the authenticated mailbox.
// SMTP_FROM may include a display name in angle brackets.
function address(value){
 const raw=String(value||'').trim();
 const match=raw.match(/<([^<>]+)>/);
 return (match?match[1]:raw).trim().toLowerCase();
}
function sender(env=process.env){
 const user=address(env.SMTP_USER);
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(user))throw Error('SMTP_USER debe ser una dirección de correo válida.');
 const desired=address(env.SMTP_FROM);
 // Never pass a formatted name as the address property.
 if(desired&&desired!==user)console.warn('MALBA SMTP: using authenticated mailbox instead of unverified SMTP_FROM.');
 return {name:String(env.SMTP_FROM_NAME||'MALBA PMC').trim().slice(0,100),address:user};
}
module.exports={sender,address};
