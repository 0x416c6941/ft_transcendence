/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./client/**/*.{html,ts}",
    ],
    theme: {
        extend: {
            colors: {
                bg:    "#0f1220",
                panel: "#161a2b",
                text:  "#e6e8f2",
                muted: "#9aa0b4",
                accent:"#4f7cff",
                line:  "#262b45",
            },
        },
    },
    plugins: [],
}