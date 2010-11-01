// Knockout Mapping plugin v0.5
// (c) 2010 Steven Sanderson, Roy Jacobs - http://knockoutjs.com/
// License: Ms-Pl (http://www.opensource.org/licenses/ms-pl.html)

// Knockout Mapping plugin v0.5
// License: Ms-Pl (http://www.opensource.org/licenses/ms-pl.html)
// Google Closure Compiler helpers (used only to make the minified file smaller)
ko.exportSymbol = function (publicPath, object) {
	var tokens = publicPath.split(".");
	var target = window;
	for (var i = 0; i < tokens.length - 1; i++)
	target = target[tokens[i]];
	target[tokens[tokens.length - 1]] = object;
};
ko.exportProperty = function (owner, publicName, object) {
	owner[publicName] = object;
};

(function () {
	ko.mapping = {};

	function getType(x) {
		if ((x) && (typeof(x) === "object") && (x.constructor.toString().match(/date/i) !== null)) return "date";
		return typeof x;
	}
	
	function fillOptions(options) {
		options = options || {};
		options.created = options.created || {};
		options.keys = options.keys || {};
		options.subscriptions = options.subscriptions || {};
		return options;
	}

	// Clones the supplied object graph, making certain things observable as per comments
	ko.mapping.fromJS = function (jsObject, options) {
		if (arguments.length == 0) throw new Error("When calling ko.fromJS, pass the object you want to convert.");

		return updateViewModel(undefined, jsObject, fillOptions(options));
	};

	ko.mapping.fromJSON = function (jsonString, options) {
		var parsed = ko.utils.parseJson(jsonString);
		return ko.mapping.fromJS(parsed, options);
	};

	ko.mapping.updateFromJS = function (viewModel, jsObject, options) {
		if (arguments.length < 2) throw new Error("When calling ko.updateFromJS, pass: the object to update and the object you want to update from.");

		return updateViewModel(viewModel, jsObject, fillOptions(options));
	};

	function updateViewModel(mappedRootObject, rootObject, options, visitedObjects, parentName) {
		var isArray = ko.utils.unwrapObservable(rootObject) instanceof Array;

		var createMappedObject = function (object, parentName) {
			// Map the new item and map all of its child properties.
			var mapped = updateViewModel(undefined, object, options, visitedObjects, parentName);
			return mapped;
		}
		
		visitedObjects = visitedObjects || new objectLookup();
		if (visitedObjects.get(rootObject)) return mappedRootObject;

		parentName = parentName || "root";

		// When using the 'created' callback, the result is used as a model for the mapped root object (which is by this point still not observable)
		if ((options.created[parentName]) && (canHaveProperties(rootObject) && (!isArray))) {
			var _options = fillOptions();
			var createdRootObject = options.created[parentName](rootObject, parentName);
			mappedRootObject = updateViewModel(undefined, createdRootObject, _options);
		}

		if (!isArray) {

			// For atomic types, do a direct update on the observable
			if (!canHaveProperties(rootObject)) {

				// If it's an array element, it should not be observable, otherwise it should
				if (ko.isWriteableObservable(mappedRootObject)) {
					mappedRootObject(ko.utils.unwrapObservable(rootObject));
				} else {
					mappedRootObject = ko.observable(ko.utils.unwrapObservable(rootObject));
					visitedObjects.save(rootObject, mappedRootObject);
				}

			} else {

				if (!mappedRootObject) {
					mappedRootObject = {};
				}

				visitedObjects.save(rootObject, mappedRootObject);

				// For non-atomic types, visit all properties and update recursively
				visitPropertiesOrArrayEntries(rootObject, function (indexer) {
					if (!ko.isObservable(mappedRootObject[indexer])) {
						mappedRootObject[indexer] = undefined;
					}
					mappedRootObject[indexer] = updateViewModel(mappedRootObject[indexer], rootObject[indexer], options, visitedObjects, indexer);
				});
			}
		} else {
			if (!ko.isObservable(mappedRootObject)) {
				mappedRootObject = ko.observableArray([]);
				subscribeToArray(mappedRootObject, options, parentName);
			}

			var keyCallback = function (x) {
				return x;
			}
			if (options.keys[parentName]) keyCallback = options.keys[parentName];
			compareArrays(ko.utils.unwrapObservable(mappedRootObject), rootObject, parentName, keyCallback, function (event, item) {
				switch (event) {
				case "added":
					var mappedItem = ko.utils.unwrapObservable(createMappedObject(item, parentName));
					mappedRootObject.push(mappedItem);
					break;
				case "retained":
					var mappedItem = getItemByKey(mappedRootObject, mapKey(item, keyCallback), keyCallback);
					updateViewModel(mappedItem, item, options, visitedObjects);
					break;
				case "deleted":
					var mappedItem = getItemByKey(mappedRootObject, mapKey(item, keyCallback), keyCallback);
					mappedRootObject.remove(mappedItem);
					break;
				}
			});
		}

		return mappedRootObject;
	}

	function mapKey(item, callback) {
		var mappedItem = item;
		if (callback) mappedItem = callback(item);

		return ko.utils.unwrapObservable(mappedItem);
	}

	function getItemByKey(array, key, callback) {
		var filtered = ko.utils.arrayFilter(ko.utils.unwrapObservable(array), function (item) {
			return mapKey(item, callback) == key;
		});

		if (filtered.length != 1) throw new Error("When calling ko.update*, the key '" + key + "' was not found or not unique!");

		return filtered[0];
	}

	function filterArrayByKey(array, callback) {
		return ko.utils.arrayMap(ko.utils.unwrapObservable(array), function (item) {
			if (callback) return mapKey(item, callback);
			else return item;
		});
	}

	function compareArrays(prevArray, currentArray, parentName, mapKeyCallback, callback, callbackTarget) {
		var currentArrayKeys = filterArrayByKey(currentArray, mapKeyCallback);
		var prevArrayKeys = filterArrayByKey(prevArray, mapKeyCallback);
		var editScript = ko.utils.compareArrays(prevArrayKeys, currentArrayKeys);

		for (var i = 0, j = editScript.length; i < j; i++) {
			var key = editScript[i];
			switch (key.status) {
			case "added":
				var item = getItemByKey(ko.utils.unwrapObservable(currentArray), key.value, mapKeyCallback);
				callback("added", item);
				break;
			case "retained":
				var item = getItemByKey(currentArray, key.value, mapKeyCallback);
				callback("retained", item);
				break;
			case "deleted":
				var item = getItemByKey(ko.utils.unwrapObservable(prevArray), key.value, mapKeyCallback);
				callback("deleted", item);
				break;
			}
		}
	}

	ko.mapping.updateFromJSON = function (viewModel, jsonString, options) {
		var parsed = ko.utils.parseJson(jsonString);
		return ko.mapping.updateFromJS(viewModel, parsed, options);
	};

	function visitPropertiesOrArrayEntries(rootObject, visitorCallback) {
		if (rootObject instanceof Array) {
			for (var i = 0; i < rootObject.length; i++)
			visitorCallback(i);
		} else {
			for (var propertyName in rootObject)
			visitorCallback(propertyName);
		}
	};

	function convertAtomicValueToObservable(valueToMap, isArrayMember, options, parentName) {
		valueToMap = ko.utils.unwrapObservable(valueToMap); // Don't add an extra layer of observability
		// Don't map direct array members (although we will map any child properties they may have)
		if (isArrayMember) return valueToMap;

		// Convert arrays to observableArrays
		if (valueToMap instanceof Array) {
			var array = ko.observableArray([]);
			subscribeToArray(array, options, parentName);
			return array;
		}

		// Map non-atomic values as non-observable objects
		if ((getType(valueToMap) == "object") && (valueToMap !== null)) {
			return valueToMap;
		}

		// Map atomic values (other than array members) as observables
		return ko.observable(valueToMap);
	}

	function canHaveProperties(object) {
		return (getType(object) == "object") && (object !== null) && (object !== undefined);
	}

	function subscribeToArray(mappedRootObject, options, parentName) {
		var subscriptions = options.subscriptions[parentName];
		var prevArray = [];
		if (subscriptions) {
			if (!(subscriptions instanceof Array)) subscriptions = [subscriptions];
			mappedRootObject.subscribe(function (currentArray) {
				compareArrays(prevArray, currentArray, parentName, options.keys[parentName], function (event, item) {
					ko.utils.arrayForEach(subscriptions, function (subscriptionCallback) {
						subscriptionCallback(event, item);
					});
				});
				prevArray = currentArray.slice(0);
			});
		}
	}

	function unwrapModel(rootObject, visitedObjects) {
		visitedObjects = visitedObjects || new objectLookup();

		rootObject = ko.utils.unwrapObservable(rootObject);
		if (!canHaveProperties(rootObject)) {
			return rootObject;
		}

		var rootObjectIsArray = rootObject instanceof Array;

		visitedObjects.save(rootObject, rootObject);

		visitPropertiesOrArrayEntries(rootObject, function (indexer) {
			var propertyValue = ko.utils.unwrapObservable(rootObject[indexer]);

			var outputProperty;
			switch (getType(propertyValue)) {
			case "object":
			case "undefined":
				var previouslyMappedValue = visitedObjects.get(propertyValue);
				rootObject[indexer] = (previouslyMappedValue !== undefined) ? previouslyMappedValue : unwrapModel(propertyValue, visitedObjects);
				break;
			default:
				rootObject[indexer] = ko.utils.unwrapObservable(propertyValue);
			}
		});

		return rootObject;
	}

	function objectLookup() {
		var keys = [];
		var values = [];
		this.save = function (key, value) {
			var existingIndex = ko.utils.arrayIndexOf(keys, key);
			if (existingIndex >= 0) values[existingIndex] = value;
			else {
				keys.push(key);
				values.push(value);
			}
		};
		this.get = function (key) {
			var existingIndex = ko.utils.arrayIndexOf(keys, key);
			return (existingIndex >= 0) ? values[existingIndex] : undefined;
		};
	};

	ko.mapping.toJS = function (rootObject) {
		if (arguments.length == 0) throw new Error("When calling ko.mapping.toJS, pass the object you want to convert.");

		// We just unwrap everything at every level in the object graph
		return unwrapModel(rootObject);
	};

	ko.mapping.toJSON = function (rootObject) {
		var plainJavaScriptObject = ko.mapping.toJS(rootObject);
		return ko.utils.stringifyJson(plainJavaScriptObject);
	};

	ko.exportSymbol('ko.mapping', ko.mapping);
	ko.exportSymbol('ko.mapping.fromJS', ko.mapping.fromJS);
	ko.exportSymbol('ko.mapping.fromJSON', ko.mapping.fromJSON);
	ko.exportSymbol('ko.mapping.updateFromJS', ko.mapping.updateFromJS);
	ko.exportSymbol('ko.mapping.updateFromJSON', ko.mapping.updateFromJSON);
	ko.exportSymbol('ko.mapping.toJS', ko.mapping.toJS);
	ko.exportSymbol('ko.mapping.toJSON', ko.mapping.toJSON);
})();