moment.locale('fr');
$(function () {
    "use strict";
	load_list();
	$('#search-field').on('input propertychange paste', load_list);
});


/*jslint indent: 4 */
/*global $, jQuery, window */
window.FontAwesomeConfig = {
	searchPseudoElements: true
};

function compareName(a, b) {
    "use strict";
    return a.name.localeCompare(b.name);
}

function compareCat(a, b) {
    "use strict";
	return a.cat - b.cat;
}

function load_list() {
    "use strict";
	
	//Récup des catégories
	var catNames;
	$.ajax({
		url :'categories.json',
		async: false,
		dataType: "JSON",
		success: function(data, status, xhr) {
			catNames = data;
		}
	});
	
	jQuery.getJSON('applis.conf', function (APPLIS) {
		
		var HTML = '', catSorted = [], DEFAULT = APPLIS.applis[0], applis = APPLIS.applis.sort(compareCat);
		//Ranger les applis par catégorie
		applis.forEach(function (cat) {
			if (catSorted[cat.cat] === void 0) { catSorted[cat.cat] = []; }
			catSorted[cat.cat].push(cat);
		});
		//Parcourir les catégories ok
		
		catSorted.forEach(function (thisCat, index) {
			//Ecrire le titre et créer la liste
			var UL = "<ul class='list_applis'>";
			//Parcourir les applis
			thisCat = thisCat.sort(compareName);
			//vérification du nombre d'applis
			var NB = 0;
			thisCat.forEach(function (obj) {
				if ((obj.name.search(new RegExp($('#search-field').val(), "i")) >= 0 || obj.tags.search(new RegExp($('#search-field').val(), "i")) >= 0 || $('#search-field').val() === '') && obj.name !== 'Default') {
					NB++;
					UL += "<li class='applis_item ";
					var ICLASS = '', DESC = '', ICON = '', vpn='', nav='', doc='', ko='' ;
					
					// Affichage du logo du logiciel
					if (obj.icon !== '') {
						ICON = obj.icon;
					} else {
						ICON = DEFAULT.icon;
					}
					
				
					
					//Ajout de classes pour le statut		
					var STATUT = null;
					var WARNING_STR = '';
					var START;
					var END;
					var MAINTENANCE = false;
					
					if (obj.ko !== void 0){STATUT = 'FAILURE';}
					
					if (obj.maintenance !== void 0){

   						 obj.maintenance.forEach(function (period, index){
        				// On garde MAINTENANCE à true si elle est déjà true,
        				// ou si on est dans la période courante
        				MAINTENANCE = MAINTENANCE || moment().isBetween(period.start, period.end, null, '[]');

        				if (MAINTENANCE === true) {  // comparaison stricte
            				STATUT = 'WARNING';
            				console.log('Valeur de MAINTENANCE :', MAINTENANCE);
        				}
				});
			}			
					
					if(obj.status_file !== void 0){
						$.ajax({
							url :'app_status/'+obj.status_file,
							async: false,
							cache: false,
							dataType: "JSON",
							success: function(data, status, xhr) {
								//On regarde la date de dernière modification du fichier
								var LAST_M = moment(xhr.getResponseHeader('Last-Modified')).valueOf();
								//si elle est supérieure à 10 min, on considère que le serveur ne réussit plus à récupérer le statut.
								if(LAST_M !== void 0 && moment.duration(moment().valueOf()-LAST_M).asMinutes() < 10){
									STATUT = data.status;
								}else{
									STATUT = 'UNKNOWN';
								}
								
								//Maintenance
								//On récupère la liste des périodes de maintenance
								
								
								if(data.start !== void 0 && data.end !== void 0 && data.comment !== void 0){
									if (moment.unix(data.start).format("D MMM") == moment.unix(data.end).format("D MMM")){
										START = moment.unix(data.start).format("HH:mm");
										END = moment.unix(data.end).format("HH:mm");
									}else{
										START = moment.unix(data.start).format("D MMM HH:mm");
										END = moment.unix(data.end).format("D MMM HH:mm");
									}
									WARNING_STR = data.comment+'<br>'+START+' à '+END;


								}


								
								//On update le statut
								if (MAINTENANCE){
									STATUT = 'WARNING';
								}
							},
							error : function(xhr, error_st, error){
								console.log(error);
							}
						});
					}
						// Affichage test maintenance

				
					
					
					switch (STATUT) {
					case 'CRITICAL':
					case 'FAILURE':
						UL += 'app_down';
						ICLASS = "fa-exclamation-circle";
						DESC = "Cette application est indisponible.";
						break;
					case 'OK':
					case 'SUCCESS':
					case 'RECOVERY':
						UL += 'app_up';
						ICLASS = "";
						DESC = obj.desc;
						break;
					case 'WARNING':
						UL += 'app_maintenance';
						ICLASS = "fa-cog fa-spin";
						DESC = (WARNING_STR != '') ? WARNING_STR : "Maintenance en cours,<br>de retour bientôt...";
						var URL = "maintenance.html";
						break;
					case 'UNKNOWN':
						var URL = obj.url;
						
					default:
						UL += 'app_no_status';
						var URL = obj.url;
						ICLASS = "";
						DESC = obj.desc;
					}

					
					UL += "'><a class='main_link' href='" + obj.url + "' target='_BLANK' title=\"" + DESC + "\">";
					UL += "<img src='" + ICON + "'>";
					UL += "<img src='" + vpn + "'>";
					UL += "<img src='" + nav + "'>";
					UL += "<span class='app_name'>" + obj.name + "</span></a>";
					UL += "<a class='fill_cont' href='" + URL + "' target='_BLANK' title=\"" + DESC + "\"><div class='right_img'></div><div class='filler'><i class='fa fa-lg " + ICLASS + "'></i><span class='text'>" + DESC + "</span></div></a></li>";
					
				}
			});
			UL += "</ul>";
			//S'il n'y a aucune application, on n'affiche pas la catégorie.
			if(NB > 0) HTML += "<h2>" + catNames[index] + " ("+NB+")</h2>"+UL;
		});
		$('.applis_cont').html(HTML);
	});
}