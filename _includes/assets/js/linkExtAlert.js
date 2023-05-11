function confirm_alert(source, lang) {
  if (source && source != '') {
    if (lang == 'De'){
      var text = 'Sie verlassen unsere Webseite!\nDer Link führt Sie zur Webseite '
    } else{
      var text = 'You are leaving our website!\nThe link leads to the website of '
    }
    return confirm(text + source + '.');
  } else {
    if (lang == 'De'){
      var text = 'Sie verlassen unsere Webseite!\nDer Link führt Sie zu einer externen Webseite.'
    }else{
      var text = 'You are leaving our website!\nThe link leads to an external website.'
    }
    return confirm(text)
  }
}
