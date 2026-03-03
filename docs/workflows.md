# Common Workflows

DFVG is versatile. Here are the most common ways to use it.

## 1. The "Daily Dailies" Workflow
**Goal:** Review today's footage on your phone or laptop without filling up storage.

1.  **Ingest:** Plug in your SD card.
2.  **Select Mode:** Choose **Compact (H.265)**.
3.  **Process:** DFVG will generate small, 720p proxies.
4.  **Sync:** Open the DFVG mobile app and scan the QR code on your desktop.
5.  **Review:** Watch clips smoothly over Wi-Fi, rate them, or download them to your phone for social media.

## 2. The Professional Edit
**Goal:** Prepare footage for a color-critical edit in DaVinci Resolve or Premiere.

1.  **Ingest:** Offload your footage to a fast SSD.
2.  **Select Mode:** Choose **ProRes (HQ)**.
3.  **Process:**
    *   DFVG transcodes your H.265/HEVC source files into **ProRes 422 HQ**.
    *   It also creates low-res proxies.
4.  **Edit:**
    *   Import the *ProRes* folder into your editor.
    *   Enjoy buttery smooth scrubbing and playback, even with 5.3K footage.
    *   Benefit from 10-bit color depth during grading.

## 3. The "Hybrid" Archive
**Goal:** Keep masters small but have edit-ready files for current projects.

1.  **Shoot:** Record in high-efficiency H.265 on your DJI Action.
2.  **Archive:** Store these original H.265 files on your long-term NAS/HDD.
3.  **Active Project:** When you want to edit a specific trip:
    *   Run DFVG in **ProRes Mode** on just that folder.
    *   Edit with the ProRes files.
    *   Once the project is done, **delete the ProRes files** and keep only the original H.265 archive + project file. You can always regenerate the ProRes later!

## 4. Mobile Transfer
**Goal:** Get a clip from your camera to your phone instantly for Instagram/TikTok.

1.  **Run:** Start DFVG on your laptop/desktop.
2.  **Connect:** Open DFVG Mobile and connect.
3.  **Browse:** Navigate to the clip you want.
4.  **Download:** Hit "Save to Camera Roll". DFVG sends the *proxy* (fast) or the *master* (high quality) depending on your choice.
