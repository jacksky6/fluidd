type NavigatorWithUserAgentDataMobile = Navigator & {
  userAgentData: {
    mobile: boolean
  }
}

const isUserAgentDataMobileSupported = (navigator: Navigator): navigator is NavigatorWithUserAgentDataMobile => {
  return (
    'userAgentData' in navigator &&
    navigator.userAgentData != null &&
    typeof navigator.userAgentData === 'object' &&
    'mobile' in navigator.userAgentData &&
    typeof navigator.userAgentData.mobile === 'boolean'
  )
}

export default isUserAgentDataMobileSupported
