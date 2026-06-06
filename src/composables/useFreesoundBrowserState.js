// Module-level refs — survive component unmount so search state is cached across opens.
import { ref } from 'vue'
import { searchSounds, fetchPage } from './useFreesound'

const query      = ref('')
const minDur     = ref('')
const maxDur     = ref('')
const cc0Only    = ref(false)
const results    = ref([])
const totalCount = ref(0)
const isLoading  = ref(false)
const error      = ref('')
const page       = ref(1)
const nextUrl    = ref(null)
const prevUrl    = ref(null)

async function doSearch(url = null) {
  error.value = ''
  isLoading.value = true
  results.value = []
  try {
    let data
    if (url) {
      data = await fetchPage(url)
    } else {
      page.value = 1
      data = await searchSounds(query.value, {
        page: 1,
        pageSize: 15,
        minDuration: minDur.value !== '' ? Number(minDur.value) : undefined,
        maxDuration: maxDur.value !== '' ? Number(maxDur.value) : undefined,
        cc0Only: cc0Only.value,
      })
    }
    results.value    = data.results
    totalCount.value = data.count
    nextUrl.value    = data.nextUrl
    prevUrl.value    = data.previousUrl
  } catch (e) {
    error.value = e.message || 'Search failed'
  } finally {
    isLoading.value = false
  }
}

function onNext() {
  if (!nextUrl.value) return
  page.value++
  doSearch(nextUrl.value)
}

function onPrev() {
  if (!prevUrl.value) return
  page.value--
  doSearch(prevUrl.value)
}

export function useFreesoundBrowserState() {
  return { query, minDur, maxDur, cc0Only, results, totalCount, isLoading, error, page, nextUrl, prevUrl, doSearch, onNext, onPrev }
}
