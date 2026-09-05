// Single place to point the frontend at the SSCMS backend (see Backend/README.md
// for how to run it). Override before this loads with:
//   <script>window.SSCMS_API_BASE = "http://your-host:8000";</script>
const SSCMS_API_BASE = window.SSCMS_API_BASE || "http://127.0.0.1:8000";
