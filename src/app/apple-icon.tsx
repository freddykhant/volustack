import { ImageResponse } from "next/og";

// The home-screen icon: the ink M on the warm canvas under the atmosphere's two hues (DESIGN.md → Brand).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#faf9f7",
          backgroundImage:
            "radial-gradient(circle at 24% -4%, rgba(255, 190, 150, 0.72), rgba(255, 190, 150, 0) 70%), radial-gradient(circle at 81% -4%, rgba(150, 168, 255, 0.6), rgba(150, 168, 255, 0) 64%)",
        }}
      >
        <svg width="110" height="110" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 19.25V11.75L10 6.75V15.25H14V9.75L20 4.75V19.25"
            stroke="#17181a"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    size,
  );
}
