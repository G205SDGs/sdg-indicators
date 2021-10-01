opensdg.maptitles = function(indicatorId) {
  if(indicatorId == "indicator_2-4-1"){

    this.mapTitle = translations.t("organically farmed agricultural land (data from destatis)")
    this.mapUnit = translations.t("%")
  }
  else if(indicatorId == "indicator_5-5-1"){

    this.mapTitle = translations.t("seats held by women in national parliament")
    this.mapUnit = translations.t("%")
  }
  else if(indicatorId == "indicator_8-5-1"){

    this.mapTitle = translations.t("gender pay gap")
    this.mapUnit = translations.t("%")
  }
  else if(indicatorId == "indicator_9-5-1"){

    this.mapTitle = translations.t("proportion of r&d expenditures to gdp")
    this.mapUnit = translations.t("%")
  }
  else if(indicatorId == "indicator_11-2-1"){

    this.mapTitle = translations.t("population that has convenient access to public transport (within 500 meters) (%)")
    this.mapUnit = translations.t("%")
  }
  return [this.mapTitle, this.mapUnit] ;

};
