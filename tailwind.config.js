/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        colors: {
            // Base colors
            black: '#000000',
            white: '#ffffff',
            transparent: 'transparent',
            // Neutral grays
            'neutral-900': '#0f0f0f',
            'neutral-800': '#1a1a1a',
            'neutral-700': '#2d2d2d',
            'neutral-600': '#4d4d4d',
            'neutral-500': '#737373',
            'neutral-400': '#a3a3a3',
            'neutral-300': '#d4d4d4',
            'neutral-200': '#e5e5e5',
            'neutral-100': '#f5f5f5',
            'neutral-50': '#fafafa',
            // Alert colors
            'red-950': '#7f1d1d',
            'red-900': '#991b1b',
            'red-500': '#ef4444',
            'red-400': '#f87171',
            'amber-400': '#fbbf24',
            'amber-300': '#fcd34d',
            'emerald-400': '#34d399',
            'emerald-950': '#064e3b',
            'orange-500': '#f97316',
            'purple-500': '#a855f7',
            'purple-500/60': 'rgba(168, 85, 247, 0.6)',
            'indigo-500': '#6366f1',
            'cyan-500': '#06b6d4',
            'blue-600': '#2563eb',
            'green-400': '#4ade80',
            'green-500': '#22c55e',
            'gray-100': '#f3f4f6',
            'gray-800': '#1f2937',
            // Synth custom colors
            'synth-neon': '#00ffcc',
            'synth-acid': '#dfff00',
            'synth-dark': '#3d0066',
            'synth-black': '#0a0a0a',
            'synth-panel': '#121212',
        },
        extend: {
            backgroundImage: {
                'grid-neon': `
                    linear-gradient(0deg, transparent 24%, rgba(0, 255, 204, 0.05) 25%, rgba(0, 255, 204, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 255, 204, 0.05) 75%, rgba(0, 255, 204, 0.05) 76%, transparent 77%, transparent),
                    linear-gradient(90deg, transparent 24%, rgba(0, 255, 204, 0.05) 25%, rgba(0, 255, 204, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 255, 204, 0.05) 75%, rgba(0, 255, 204, 0.05) 76%, transparent 77%, transparent)
                `,
            },
            backgroundSize: {
                'grid-neon': '50px 50px',
            }
        },
    },
    plugins: [],
}