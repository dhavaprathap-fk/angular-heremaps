/**
 * Created by Dmytro on 4/11/2016.
 */
module.exports = function(
    $timeout,
    $window,
    $rootScope,
    $filter,
    HereMapsConfig,
    APIService,
    HereMapUtilsService,
    MarkersService,
    CONSTS,
    EventsModule) {
    return {
        restrict: 'EA',
        template: "<div ng-style=\"{'width': mapWidth, 'height': mapHeight}\"></div>",
        replace: true,
        scope: {
            opts: '&options',
            places: '&',
            onMapReady: "&mapReady",
            events: '&'
        },
        controller: function($scope, $element, $attrs) {
            var places = $scope.places(),
                opts = $scope.opts(),
                listeners = $scope.events();
                
            var options = angular.extend({}, CONSTS.DEFAULT_MAP_OPTIONS, opts),
                position = HereMapUtilsService.isValidCoords(options.coords) ? options.coords : CONSTS.DEFAULT_MAP_OPTIONS.coords;

            var heremaps = {},
                mapReady = $scope.onMapReady(),
                _onResizeMap = null;;

            $timeout(function() {
                return _setMapSize();
            }).then(function() {
                APIService.loadApi().then(_apiReady);
            });

            options.resize && addOnResizeListener();

            $scope.$on('$destroy', function() {
                $window.removeEventListener('resize', _onResizeMap);
            });

            function addOnResizeListener() {
                _onResizeMap = HereMapUtilsService.throttle(_resizeHandler, CONSTS.UPDATE_MAP_RESIZE_TIMEOUT);
                $window.addEventListener('resize', _onResizeMap);
            }

            function _apiReady() {
                _setupMapPlatform();
                _setupMap();
            }

            function _setupMapPlatform() {
                if (!HereMapsConfig.app_id || !HereMapsConfig.app_code)
                    throw new Error('app_id or app_code were missed. Please specify their in HereMapsConfig');

                heremaps.platform = new H.service.Platform(HereMapsConfig);
                heremaps.layers = heremaps.platform.createDefaultLayers();
            }

            function _getLocation() {
                return APIService.getPosition({
                    coords: position,
                    enableHighAccuracy: true,
                    maximumAge: 10000
                });
            }

            function _locationFailure() {
                console.error('Can not get a geo position');
            }

            function _setupMap() {
                _initMap(function() {
                    APIService.loadModules($attrs.$attr, {
                        "controls": _uiModuleReady,
                        "events": _eventsModuleReady
                    });
                });
            }

            function _initMap(cb) {
                var map = heremaps.map = new H.Map($element[0], heremaps.layers.normal.map, {
                    zoom: HereMapUtilsService.isValidCoords(position) ? options.zoom : options.maxZoom,
                    center: new H.geo.Point(position.latitude, position.longitude)
                });

                // MarkersService.addUserMarker(map, {
                //     pos: { lat: position.latitude, lng: position.longitude }
                // });

                MarkersService.addMarkersToMap(map, places);

                mapReady && mapReady(MapProxy());

                cb && cb();
            }

            function _uiModuleReady() {
                var ui = heremaps.ui = H.ui.UI.createDefault(heremaps.map, heremaps.layers);
                _setControlsPosition(ui);
            }

            function _setControlsPosition(ui) {
                var position = $attrs.controls;
                if (!ui || !_isValidPosition(position))
                    return;

                var availableControls = CONSTS.CONTROLS;
                for (key in availableControls) {
                    if (!availableControls.hasOwnProperty(key))
                        continue;
                    var value = availableControls[key],
                        control = ui.getControl(value);

                    if (!control)
                        return;

                    control.setAlignment(position);
                }
            }

            function _isValidPosition(position) {
                var isValid = false;
                switch (position) {
                    case 'top-right':
                    case 'top-left':
                    case 'bottom-right':
                    case 'bottom-left':
                        isValid = true;
                        break;
                    default:
                        isValid = false;
                }

                return isValid;
            }
            
            function _eventsModuleReady() {
                EventsModule.start({
                    platform: heremaps,
                    listeners: listeners,
                    options: options,
                    injector: _moduleInjector
                });
            }
            
            function _moduleInjector(){
                return function(id){
                    return heremaps[id];
                }
            }

            function _resizeHandler() {
                _setMapSize();

                heremaps.map.getViewPort().resize();
            }

            function _setMapSize() {
                var height = $element[0].parentNode.offsetHeight || options.height,
                    width = $element[0].parentNode.offsetWidth || options.width;

                $scope.mapHeight = height + 'px';
                $scope.mapWidth = width + 'px';

                HereMapUtilsService.runScopeDigestIfNeed($scope);
            }

            function MapProxy() {
                return {
                    getPlatform: function() {
                        return heremaps;
                    },
                    calculateRoute: function(driveType, direction) {
                        APIService.calculateRoute(heremaps.platform, heremaps.map, {
                            driveType: driveType,
                            direction: direction
                        });
                    },
                    setZoom: function(zoom) {
                        heremaps.map.setZoom(zoom || 10);
                    },
                    setCenter: function(coords) {
                        if (!coords) {
                            return _getLocation()
                                .then(function(response) {
                                    heremaps.map.setCenter({
                                        lng: response.coords.longitude,
                                        lat: response.coords.latitude
                                    });
                                })
                                .catch(_locationFailure);
                        }

                        heremaps.map.setCenter(coords);
                    },
                    updateMarkers: function(places) {
                        MarkersService.updateMarkers(heremaps.map, places);
                    }
                }
            }

        }
    }
};